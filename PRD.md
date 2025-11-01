# Product Requirements Document (PRD) — Habit-Tracking-Bud

Last updated: 2025-11-01

## 1. Overview

Habit-Tracking-Bud is a lightweight, single-page React (Vite) application for creating simple recurring and one-time reminders that start short focus timers (breaks). The app aims to help users build small, repeatable healthy habits through gentle reminders and short focus sessions, complemented by a daily inspirational quote.

This PRD documents the current product behavior (what's implemented), acceptance criteria, technical architecture, data model, user flows, metrics, risks, and suggested next steps.

## 2. Objectives & Success Metrics

Primary objective:
- Help users complete small habit-focused sessions (e.g., stretch, breath, micro-task) through scheduled reminders and short timers.

Success metrics (initial):
- DAU/WAU track (placeholder for later analytics)
- Number of completed sessions per user (tracked locally in `stats.completed`)
- Retention for returning users (tracked via `stats.streak` / `lastCompletionDate`)
- Feature stability: no console errors in normal flows; timers finish reliably.

## 3. Target Users
- Individuals who want micro-habit reminders during the day (knowledge workers, students).
- Users who prefer a lightweight, local-first app without backend dependencies.

## 4. Current Features (Implemented)
- User onboarding screen to set a display name.
- Create reminders: recurring reminders (interval in minutes + break duration) and one-time reminders (time + duration).
- Start/pause reminders: toggle active/pause per reminder.
- Pending breaks queue: when a reminder becomes due it appears as a pending break card with Start / Snooze / Skip options.
- Active timers: when a break is started it appears in an active timer list with an option to focus (open focus overlay) or end early.
- Focus overlay: immersive view with particle animation, a visible countdown, and End/Close controls. Also closes on ESC or background click.
- Deterministic timer model: timers derive remaining time from a `startedAt` timestamp + `durationSeconds`. This prevents race conditions and ensures consistent finishes across components.
- Visual ticker: active timer card and focus overlay both show a per-second visual countdown driven by small local intervals but the finish logic remains timestamp-based.
- Daily quotes: the app attempts to fetch a short quote from Google Gemini (via `@google/genai`). Quotes are cached daily in `localStorage` under keys `dailyQuote` and `dailyQuoteDate`. If the API key is missing or fetch fails, a fallback quote is used and cached for the day.
- Theme toggle: global dark/light theme controlled by a `theme` key in `localStorage`. Theme is applied via `data-theme` on the document root.
- Local persistence: reminders, stats, theme, and session state are persisted to `localStorage` (via a `useLocalStorage` helper).
- Safety & UX fixes implemented: input NaN handling, stable hooks to avoid infinite renders, and defensive localStorage operations.

## 5. Technical Architecture
- Frontend-only, single-page React app built with Vite (no backend by default).
- Main app file: `index.tsx` contains components and logic.
- Libraries: React, Vite, `@google/genai` (client used for quote generation when API key present).
- Storage: `localStorage` is the single source of persisted state (reminders, stats, theme, daily quote).
- Timer architecture: immutable/deterministic timers computed from timestamps; local per-component tickers for visual updates.

## 6. Data Model (local)
- Reminder
  - id: string
  - name: string
  - duration: number (minutes)
  - active: boolean
  - createdAt: number (timestamp ms)
  - lastTriggered: number (timestamp ms)
  - type: 'recurring'|'once'
  - interval?: number (minutes)
  - triggerTime?: string (HH:mm)

- ActiveBreak
  - id: string (same as reminder id)
  - name: string
  - startedAt: number (timestamp ms)
  - durationSeconds: number

- Stats
  - completed: number
  - streak: number
  - lastCompletionDate: string | null

- Local keys of note: `reminders`, `stats`, `theme`, `isSessionActive`, `dailyQuote`, `dailyQuoteDate`, `userName`.

## 7. Key User Flows

1. Onboarding
   - User opens app -> sees Welcome screen -> enters name -> proceeds to Dashboard.

2. Create a recurring reminder
   - Go to New Reminder -> choose Recurring -> set interval (minutes) and duration -> Add -> reminder shows in list.

3. Reminder triggers (recurring)
   - While session is active, the app's checker determines when a reminder is due and adds it to pending breaks -> user sees PendingBreakCard -> user can Start, Snooze, or Skip.

4. Start & focus
   - User starts a break -> ActiveTimerCard appears -> user can open FocusScreen -> countdown visible and per-second ticks update UI.

5. Finish break
   - When remaining ≤ 0, the app removes the active break, updates the parent reminder's `lastTriggered`, and increments stats.

## 8. Acceptance Criteria
- Users can add recurring and one-time reminders and see them trigger correctly when due.
- Starting a break creates an `ActiveBreak` with `startedAt` and `durationSeconds` and the UI shows a ticking countdown.
- Focus overlay and ActiveTimerCard remain synchronized in remaining time (within a 1s visual tick) and finish deterministically.
- Quote fetch uses `VITE_GEMINI_API_KEY` when present, and falls back to cached / fallback quote when absent.
- No infinite render loops or console errors in normal flows (tested scenarios).

## 9. Non-functional Requirements
- The app must work offline for core reminder/timer functionality (quotes require network to fetch fresh content).
- Minimal CPU usage for timers — per-component 1s tick is acceptable for small numbers of active timers.
- Secure by default: do not commit API keys; display clear banner when a client-side key is missing.

## 10. Risks & Open Questions
- Storing API keys on the client is insecure; consider server-side proxy or serverless function to keep keys secret for production.
- Single-user local-first model means users can't sync across devices. Consider optional cloud sync or account-based storage.
- Timezone and DST edge cases for one-time reminders need explicit tests (current approach uses local device time).

## 11. Suggested Next Features (separate - confirm before adding to PRD)
- Optional cloud sync (user accounts) with encrypted storage.
- Server-side quote fetcher to hide API keys and enable richer content.
- Better snooze UX: presets and quick actions; allow snoozing all reminders for X minutes.
- Notification support (native notifications + permission flow) for reminders when the app is in the background.
- Import/export reminders (JSON) for portability.
- Analytics dashboard (local-first) showing productivity trends.

## 12. Implementation plan & rough milestones (if you want to continue)
- M1: Add basic notification permissions & native notifications (2-4 days).
- M2: Add cloud sync with simple auth (OAuth) + serverless storage (5-10 days).
- M3: Add CI workflow + tests and publish package (1-2 days).



## Phased Roadmap & Prioritized Feature Suggestions
Below is a practical, prioritized roadmap that maps your ideas into phases (M1..M4). Each phase includes feature descriptions, why it's valuable, rough estimates, dependencies, and acceptance criteria. Items are prioritized by ease of implementation and user impact.

PHASE M1 — Core backend + safe APIs (Low effort, high value)
- Persistent backend (Firebase Firestore)
   - Why: Moves the app from device-only to cloud-backed so settings, reminders, and stats sync across devices.
   - Rough estimate: 1-3 days for simple Firestore integration; 3-7 days to add user accounts and rules.
   - Dependencies: Firebase project + client config, server rules.
   - Acceptance: Reminders/stats persist and sync across devices logged into same account.

- Server-side quote fetcher (serverless function)
   - Why: Keep AI API keys off the client and enable richer prompts and caching.
   - Rough estimate: 1-2 days (serverless function + endpoint).
   - Acceptance: App calls a secure endpoint for daily quotes; no client-side Gemini key required.

PHASE M2 — Calendar & scheduling intelligence (Medium effort)
- Calendar import (Google/Microsoft)
   - Why: Enables conflict-aware scheduling by reading the user's calendar.
   - Rough estimate: 3-6 days for OAuth + read-only calendar events.
   - Acceptance: User connects calendar; today's events appear in-app and block suggested times.

- Auto-scheduling around calendar (conflict-aware)
   - Why: Create reminders that avoid existing events when user requests recurring breaks.
   - Rough estimate: 2-5 days for initial algorithm + UI.
   - Acceptance: Given user constraints (every X mins for Y mins), the app proposes non-conflicting reminder times and allows confirmation.

PHASE M3 — Mobile capture & natural language (Higher effort)
- Mobile photo import + OCR for calendar parsing
   - Why: Capture a physical calendar or screenshot and extract events automatically.
   - Rough estimate: 3-8 days for basic OCR + confirmation UX.
   - Acceptance: Extracted events are shown for user confirmation with reasonable accuracy on clear images.

- Speech-to-text + rule-based natural language parsing
   - Why: Let users add or edit reminders by speaking ("water sip every 45 minutes for 10 seconds").
   - Rough estimate: 3-7 days for Web Speech API integration + rule-based parser; 1-3 days more for server LLM fallback.
   - Acceptance: Common phrasings produce correct reminders; speech fallback errors are handled gracefully.

PHASE M4 — Conversational editing & advanced AI (Higher effort)
- Conflict suggestions & voice edits
   - Why: When conflicts occur, suggest next windows and enable voice-based edits.
   - Rough estimate: 3-6 days for UI & heuristics; more with LLM-driven dialogs.
   - Acceptance: The app can suggest alternative slots and accept edits via voice or tap.

- LLM-based intent parsing for complex commands
   - Why: Robustly parse complex scheduling requests and multi-step instructions.
   - Rough estimate: 5-14 days for integration, prompts, safety.
   - Acceptance: Accurate parsing of complex commands and safe confirmation flows.

Additional helpful features
- Native notifications & background scheduling for mobile.
- Import/export (JSON) for portability.
- Analytics dashboard for trend insights.

Prioritization rationale
- Start with M1 (Firestore + serverless quote fetch) to unlock sync and remove client API keys.
- Then M2 (calendar & scheduling) because it directly addresses your main use-case: scheduling breaks around meetings.
- M3/M4 add mobile capture, speech, and AI-driven parsing — higher effort but high UX value; start with rule-based parsers and pilot before scaling.