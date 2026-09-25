# Meera Notes Bot

A Telegram bot that turns Meera's raw notes into LinkedIn posts in her voice. It runs on Vercel.

1. Meera sends a raw note (a text message) to the bot.
2. Telegram forwards the message to the Vercel function at `/api/webhook`.
3. The function sends the note to Gemini, with `meera_voice.md` as the system instruction.
4. Gemini writes one LinkedIn post, and the bot replies in the same chat with only the post text.

The bot ignores messages from everyone except `ALLOWED_USER_ID`.

## Files

| File | Purpose |
| --- | --- |
| `api/webhook.js` | The Vercel function Telegram calls for every new message |
| `lib/draft.js` | Builds the Gemini prompt, calls Gemini, cleans up the reply |
| `lib/telegram.js` | Sends messages back to Telegram |
| `meera_voice.md` | Meera's voice profile. Edit it, then redeploy. |
| `scripts/set-webhook.js` | Points the bot at your Vercel URL (run once after the first deploy) |
| `scripts/try-note.js` | Drafts a post from a note on your machine, without Telegram |
| `vercel.json` | Gives the function 60 seconds and bundles `meera_voice.md` with it |
| `.env.example` | Template for your keys |

There are no npm dependencies. You need Node.js 18 or newer on your machine for the scripts.

## 1. Create the bot with BotFather

1. In Telegram, open a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Choose a display name (for example, `Meera Notes`) and a username ending in `bot` (for example, `meera_notes_bot`).
4. BotFather replies with a token like `123456789:AAH...`. This is your `TELEGRAM_BOT_TOKEN`. Keep it secret: anyone with it can control the bot.

## 2. Get a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and sign in.
2. Click **Create API key** and copy it. This is your `GEMINI_API_KEY`.

## 3. Find Meera's Telegram user ID

The user ID is a number (for example, `123456789`), not her @username.

1. Meera opens a chat with [@userinfobot](https://t.me/userinfobot) in Telegram and sends it any message.
2. It replies with her details. The `Id` value is her `ALLOWED_USER_ID`.

## 4. Fill in `.env`

Copy `.env.example` to `.env` and fill in the values. For `TELEGRAM_WEBHOOK_SECRET`, generate a random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env` is only for the local scripts. It is listed in `.gitignore` and `.vercelignore`, so it is never uploaded.

Optional: test the voice before deploying. This calls Gemini and prints the post:

```bash
npm run try -- "Customers keep asking if our serum pills under sunscreen. It doesn't, but only if you wait 60 seconds."
```

## 5. Deploy to Vercel

1. Push this folder to a GitHub repository. `.env` is ignored and will not be pushed.
2. In [Vercel](https://vercel.com/new), import the repository. Leave the framework preset as **Other** and leave the build settings empty.
3. Before clicking **Deploy**, open **Environment Variables** and add `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `ALLOWED_USER_ID` and `TELEGRAM_WEBHOOK_SECRET` with the same values as your `.env`. (`GEMINI_MODEL` is optional.)
4. Deploy. Note the production URL, for example `https://meera-notes-bot.vercel.app`.
5. Open that URL followed by `/api/webhook` in a browser. It should say `Meera notes bot is running.`

If you add or change environment variables after deploying, redeploy (**Deployments > ... > Redeploy**). Running deployments don't pick up the new values.

## 6. Connect Telegram to Vercel

Run this once from this folder, with your production URL:

```bash
npm run webhook -- https://meera-notes-bot.vercel.app
```

It prints `Webhook set to https://.../api/webhook`. Meera can now open the bot in Telegram, press **Start**, and send a note.

To check the status (pending messages, last error):

```bash
npm run webhook -- --info
```

Use the stable production URL (`your-project.vercel.app`), not a per-deployment preview URL. Preview URLs change on every deploy, and Vercel's Deployment Protection blocks them.

## Updating the voice

Edit `meera_voice.md`, commit and push. Vercel redeploys automatically, and the next note uses the new voice.

## How it behaves

- **Only Meera:** Messages from any other Telegram user get no reply. Requests to `/api/webhook` without the correct `TELEGRAM_WEBHOOK_SECRET` get a 401 error.
- **Long posts:** Posts over Telegram's 4096-character limit are sent as several messages, split at paragraph breaks.
- **Long notes:** Telegram splits a note over 4096 characters into several messages, and each one becomes a separate post. Meera should keep each note under that length.
- **Commands and non-text messages:** `/start` (and any other command), photos, voice notes and stickers get a short reminder to send a text note.
- **API errors:** Rate limits, server errors and timeouts are retried, within a 50-second limit. If Gemini still fails, or returns nothing, the bot replies with a short error message.
- **Missing facts:** Gemini is told not to invent numbers, dates or stories. If the post needs a detail the note doesn't give, it leaves a `[bracketed placeholder]` for Meera to fill in.
- **Model:** `gemini-3.8-flash` unless `GEMINI_MODEL` is set.
- **Logs:** Vercel's **Logs** tab shows each note's and post's length and any errors. The logs don't include the note or post text.

## Troubleshooting

- **The bot doesn't reply:** Run `npm run webhook -- --info` and read `last_error_message`.
  - `401 Unauthorized` means `TELEGRAM_WEBHOOK_SECRET` in Vercel doesn't match `.env`.
  - `500` means an environment variable is missing in Vercel. Add it and redeploy.
  - Also check that Meera's ID matches `ALLOWED_USER_ID`.
- **Duplicate posts:** Telegram re-sends a message if the function doesn't answer within about a minute. The 50-second limit on Gemini work is there to prevent this. If it still happens, check the Vercel logs for timeouts.
