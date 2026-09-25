// Drafts a post from a note on your machine, without Telegram. Useful for
// tuning meera_voice.md before deploying.
//
//   npm run try -- "raw note text here"
//
// Reads GEMINI_API_KEY (and optional GEMINI_MODEL) from .env.

import "./load-env.js";
import { generatePost } from "../lib/draft.js";

const note = process.argv.slice(2).join(" ").trim();
if (!note) {
  console.error('Usage: npm run try -- "raw note text here"');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY?.trim()) {
  console.error("GEMINI_API_KEY is missing from .env");
  process.exit(1);
}

try {
  const post = await generatePost(note, {
    apiKey: process.env.GEMINI_API_KEY.trim(),
    model: process.env.GEMINI_MODEL?.trim() || undefined,
  });
  console.log(post);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
