// Vercel serverless function. Telegram POSTs every new message here.
//
// Flow: Meera sends a text note -> the note plus meera_voice.md go to Gemini ->
// Gemini writes one LinkedIn post -> the bot replies with the post text only.

import { timingSafeEqual } from "node:crypto";
import { generatePost, PostError } from "../lib/draft.js";
import { sendText, sendTyping } from "../lib/telegram.js";

function readConfig() {
  const config = {
    token: process.env.TELEGRAM_BOT_TOKEN?.trim(),
    apiKey: process.env.GEMINI_API_KEY?.trim(),
    allowedUserId: process.env.ALLOWED_USER_ID?.trim(),
    secret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim(),
    model: process.env.GEMINI_MODEL?.trim() || undefined,
  };
  const missing = ["TELEGRAM_BOT_TOKEN", "GEMINI_API_KEY", "ALLOWED_USER_ID", "TELEGRAM_WEBHOOK_SECRET"]
    .filter((name) => !process.env[name]?.trim());
  return { config, missing };
}

function secretMatches(received, expected) {
  const a = Buffer.from(String(received ?? ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleUpdate(update, config) {
  // Only plain new messages. Edits, channel posts etc. are ignored.
  const message = update?.message;
  if (!message) return;

  // Only Meera's messages get a reply. Everyone else is silently ignored.
  if (String(message.from?.id) !== config.allowedUserId) {
    console.log(`Ignoring message from user ${message.from?.id}`);
    return;
  }

  const chatId = message.chat.id;
  const text = (message.text ?? "").trim();

  if (text.startsWith("/")) {
    await sendText(config.token, chatId, "Hi Meera. Send me a raw note as a text message and I'll turn it into a LinkedIn post.");
    return;
  }
  if (!text) {
    await sendText(config.token, chatId, "Send me a raw note as a text message and I'll turn it into a LinkedIn post.");
    return;
  }

  console.log(`Received note (${text.length} chars)`);
  await sendTyping(config.token, chatId);

  let reply;
  try {
    reply = await generatePost(text, { apiKey: config.apiKey, model: config.model });
    console.log(`Generated post (${reply.length} chars)`);
  } catch (err) {
    if (!(err instanceof PostError)) console.error("Unexpected error while generating post:", err);
    reply = err instanceof PostError
      ? err.message
      : "Something went wrong while writing the post. Please try again.";
  }
  await sendText(config.token, chatId, reply);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Meera notes bot is running.");
  }

  const { config, missing } = readConfig();
  if (missing.length) {
    // 500 makes Telegram keep the note and retry, so nothing is lost while
    // the environment variables are being fixed.
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    return res.status(500).send("Server not configured");
  }

  // Telegram sends the secret set in scripts/set-webhook.js with every
  // request. Anything without it did not come from Telegram.
  if (!secretMatches(req.headers["x-telegram-bot-api-secret-token"], config.secret)) {
    return res.status(401).send("Unauthorized");
  }

  let update = req.body;
  if (typeof update === "string") {
    try {
      update = JSON.parse(update);
    } catch {
      return res.status(400).send("Bad request");
    }
  }

  // Always answer 200 once the update is handled (even if the reply failed),
  // otherwise Telegram re-sends the same note and Meera gets duplicates.
  try {
    await handleUpdate(update, config);
  } catch (err) {
    console.error("Failed to handle update:", err);
  }
  return res.status(200).send("ok");
}
