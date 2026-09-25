// Minimal Telegram Bot API client. Request URLs contain the bot token, so
// never log them.

// Telegram caps messages at 4096 characters. Stay a little under it.
const TELEGRAM_LIMIT = 4000;

export async function callTelegram(token, method, params) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${res.status} ${data.description ?? ""}`);
  }
  return data.result;
}

export async function sendText(token, chatId, text) {
  for (const chunk of splitMessage(text)) {
    await callTelegram(token, "sendMessage", { chat_id: chatId, text: chunk });
  }
}

export async function sendTyping(token, chatId) {
  try {
    await callTelegram(token, "sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    // Cosmetic only.
  }
}

/** Split on paragraph, then line, then word boundaries to fit Telegram. */
export function splitMessage(text, limit = TELEGRAM_LIMIT) {
  const chunks = [];
  while (text.length > limit) {
    let cut = text.lastIndexOf("\n\n", limit);
    if (cut <= 0) cut = text.lastIndexOf("\n", limit);
    if (cut <= 0) cut = text.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    chunks.push(text.slice(0, cut).trimEnd());
    text = text.slice(cut).trimStart();
  }
  if (text) chunks.push(text);
  return chunks;
}
