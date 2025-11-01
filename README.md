# Habit-Tracking-Bud

Lightweight habit/reminder app with focus timers and daily inspirational quotes.

This repository contains the Habit-Tracking-Bud single-file React app (Vite). The app includes:
- Recurring and one-time reminders
- Active timers and a focus overlay
- Dark / light theme toggle (stored in localStorage)
- Daily quote fetched from Google Gemini with local caching and graceful fallback

## Prerequisites
- Node.js (14+ recommended)
- npm (or yarn/pnpm)

## Setup
1. Install dependencies:

```powershell
npm install
```

2. Create a `.env.local` in the project root if you need live Gemini quotes. NOTE: Vite requires client-exposed variables to be prefixed with `VITE_`.

```text
VITE_GEMINI_API_KEY=your_api_key_here
# (optional) VITE_API_KEY can also be used as a fallback
```

If no key is present the app will show a friendly banner and use a cached fallback quote.

3. Start the dev server:

```powershell
npm run dev
```

Open http://localhost:5173 (or the port printed by Vite).

## Key Implementation Notes
- Timer model: timers are deterministic and derived from a `startedAt` timestamp + `durationSeconds`. This prevents race conditions and keeps finishes accurate across components.
- Visual ticker: both the active timer card and focus overlay keep a small local 1s tick so their displayed clock visually decrements while the finish condition remains timestamp-based.
- Quotes: daily caching is implemented via `localStorage` keys `dailyQuote` and `dailyQuoteDate` to limit API calls. Clear those keys in DevTools to force a fetch.
- Theme: theme choice is stored in `localStorage` under the `theme` key and applied via `data-theme` on the document root.

## Environment & Secrets
- Do NOT commit your `.env.local` or any API keys. Ensure `.gitignore` includes `.env*` entries.

## Troubleshooting
- If you see the app returning the fallback quote, restart the dev server after adding the `VITE_GEMINI_API_KEY` to `.env.local` (Vite reads env files at startup). Then clear the daily quote cache in the browser console:

```js
localStorage.removeItem('dailyQuote');
localStorage.removeItem('dailyQuoteDate');
location.reload();
```

- If you get React warnings about NaN values for inputs, open the New Reminder form and ensure numeric fields accept numbers; the app now safely coerces user input to avoid NaN warnings.

## Next steps (optional)
- Add an automated CI workflow (GitHub Actions) to run builds and tests on PRs.
- Add a README section for contribution guidelines and licensing if you plan to open-source.

---

If you'd like, I can add a minimal `README` section for contribution/licensing or scaffold a GitHub Actions workflow — tell me which and I'll create it.
