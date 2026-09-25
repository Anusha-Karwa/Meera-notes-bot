// Points the Telegram bot at the deployed Vercel function.
//
//   npm run webhook -- https://your-app.vercel.app   register the webhook
//   npm run webhook -- --info                        show current status
//   npm run webhook -- --delete                      remove the webhook
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.

import "./load-env.js";
import { callTelegram } from "../lib/telegram.js";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const arg = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!token) fail("TELEGRAM_BOT_TOKEN is missing from .env");

if (arg === "--info") {
  const info = await callTelegram(token, "getWebhookInfo", {});
  console.log(JSON.stringify(info, null, 2));
} else if (arg === "--delete") {
  await callTelegram(token, "deleteWebhook", {});
  console.log("Webhook removed.");
} else if (arg?.startsWith("https://")) {
  if (!secret) fail("TELEGRAM_WEBHOOK_SECRET is missing from .env");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    fail("TELEGRAM_WEBHOOK_SECRET may only contain letters, numbers, _ and -");
  }
  const url = `${arg.replace(/\/+$/, "")}/api/webhook`;
  await callTelegram(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    max_connections: 5,
  });
  console.log(`Webhook set to ${url}`);
} else {
  fail("Usage: npm run webhook -- https://your-app.vercel.app | --info | --delete");
}
