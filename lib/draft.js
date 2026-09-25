// Turns one raw note into a LinkedIn post in Meera's voice using Gemini.
//
// The voice lives in meera_voice.md so it can be edited without touching code.
// It is read on every request, so a redeploy is all an edit needs.

import { readFile } from "node:fs/promises";
import path from "node:path";

const VOICE_FILE = path.join(process.cwd(), "meera_voice.md");
const DEFAULT_MODEL = "gemini-3.8-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Vercel stops the function after maxDuration (60s in vercel.json), and
// Telegram re-sends the note if we don't answer in time. Keep all Gemini
// work inside this budget so there is always time left to reply.
const TIME_BUDGET_MS = 50_000;
const ATTEMPT_TIMEOUT_MS = 40_000;
const MAX_ATTEMPTS = 3;

// Task instructions wrapped around the voice profile.
const TASK_INSTRUCTION = `You are ghostwriting for Meera Pillai, founder of Skinstinct.
The document after the divider is her voice profile. Follow it closely.

Your task: the user message is one raw note from Meera. Turn it into exactly
one LinkedIn post in her voice, following the LinkedIn rules in the profile.

Output rules:
- Output only the post text, ready to paste into LinkedIn.
- No preamble, title, commentary, explanation, alternatives or sign-off.
- No markdown formatting of any kind.
- Do not invent facts, numbers, dates or customer stories. If the post needs a
  detail the note does not give, use a [bracketed placeholder] instead.

==================== VOICE PROFILE ====================
`;

/** An error whose message is safe to show to Meera. */
export class PostError extends Error {}

async function loadSystemInstruction() {
  let voice;
  try {
    voice = (await readFile(VOICE_FILE, "utf8")).trim();
  } catch (err) {
    console.error("Could not read voice file:", err.message);
    throw new PostError("I couldn't read meera_voice.md, so I can't write the post.");
  }
  if (!voice) {
    throw new PostError("meera_voice.md is empty, so I can't write the post.");
  }
  return TASK_INSTRUCTION + voice;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generatePost(note, { apiKey, model = DEFAULT_MODEL } = {}) {
  const systemInstruction = await loadSystemInstruction();
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: `Raw note:\n\n${note}` }] }],
  });

  const deadline = Date.now() + TIME_BUDGET_MS;
  let data;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    const lastChance = attempt === MAX_ATTEMPTS || remaining < ATTEMPT_TIMEOUT_MS / 2;
    let status = 0;

    try {
      const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
      });
      status = res.status;
      if (res.ok) {
        data = await res.json();
        break;
      }
      console.warn(`Gemini error (attempt ${attempt}): ${status} ${await res.text()}`);
    } catch (err) {
      // Network errors and timeouts.
      console.warn(`Gemini request failed (attempt ${attempt}): ${err.name} ${err.message}`);
    }

    const retryable = status === 0 || status === 429 || status >= 500;
    if (retryable && !lastChance) {
      await sleep(2 ** attempt * 1000);
      continue;
    }
    if (status === 429) {
      throw new PostError("Gemini is rate-limiting requests right now. Please try again in a minute.");
    }
    if (status === 404) {
      throw new PostError(`Gemini doesn't recognise the model "${model}". Set GEMINI_MODEL to a current model name.`);
    }
    if (status === 400 || status === 401 || status === 403) {
      throw new PostError("Gemini rejected the request. Please check GEMINI_API_KEY and GEMINI_MODEL.");
    }
    if (status === 0) {
      throw new PostError("I couldn't reach Gemini. Please try again in a moment.");
    }
    throw new PostError("Gemini returned an error, so I couldn't write the post. Please try again.");
  }

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  const post = cleanPost(text);

  if (!post) {
    const reason = data?.promptFeedback?.blockReason ?? candidate?.finishReason;
    console.warn(`Gemini returned no text (reason: ${reason})`);
    throw new PostError("Gemini returned an empty response for this note. Please try rephrasing it.");
  }
  return post;
}

const PREAMBLE = /^\s*(here(?:'s| is)|sure|certainly|okay|ok)\b[^\n]*:\s*\n+/i;

/** Strip anything the model wrapped around the post despite instructions. */
export function cleanPost(text) {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n([\s\S]*)\n```$/, "$1")
    .replace(PREAMBLE, "")
    .trim();
}
