# Rangefinder

CRM revenue forecast as a range, with an exact explanation of every change between runs.

```
web/      React + Vite + Tailwind + Recharts + GSAP (landing and app screens; runs on mocks by default)
server/   Node + Express API over Supabase Postgres; POST /run starts the Python engine
engine/   Python: generator, models, Monte Carlo, snapshots, attribution, backtest
supabase/migrations/   schema (applied to project vwmftyrxospghiupzaxa)
```

## Flow

Landing → sign up / sign in (Supabase email + password) → name your workspace → Data: upload a pipeline CSV
(template on the page) or load the sample company → first forecast runs → Dashboard. Each week, re-upload the
pipeline and **What changed** explains the difference, deal by deal.

## Landing page

`/` is one scroll-driven story with no static cards; every figure is drawn from the sample company's data in
`web/src/mocks` and moves with the scroll (GSAP ScrollTrigger and ScrollSmoother).

1. **Hero**: a fan of revenue paths that leans toward the pointer and collapses into one number as you scroll.
2. **How it works** (pinned): twelve real deals pop out of the CRM formula, re-score, decay with silence, regroup
   and calibrate by salesperson, run out to their payment dates, then feed 10,000 simulated futures that close
   into a range with the chance of hitting target. Hover a deal for its numbers.
3. **Try the range**: pick 30, 60 or 90 days and bookings or cash, then drag the target; the chance re-counts.
4. **Why it moved** (pinned): a waterfall from last week to this week, step by step, naming the deals behind each step.
5. **Proof** (pinned): twelve months of backtests drawn month by month, then the error against the stage formula.

With reduced motion, each scene jumps to its finished state. Code: `web/src/pages/Landing.tsx` and one file per
scene in `web/src/components/landing/` (`data.ts` holds the numbers, `scroll.ts` ties timelines to the scroll).
The scene-by-scene story is in `docs/landing_scroll_story.md`.

## Run

1. `cp .env.example .env` and fill in the Supabase URL, anon key and `SUPABASE_DB_URL`
   (Supabase > Connect > Session pooler URI, password URL-encoded). Optional: `GEMINI_API_KEY` for chat.
2. Apply `supabase/migrations/*.sql` in order to your Supabase project.
3. Python engine: `python3 -m venv engine/.venv && engine/.venv/bin/pip install numpy scipy scikit-learn "psycopg[binary]" python-dotenv`
4. API: `cd server && npm install && npm start` (port 8787)
5. Web: `cd web && npm install && npm run dev` (http://localhost:5173)
6. For instant demo sign-ups, turn off Authentication > Email > Confirm email in Supabase.

Checks: `engine/.venv/bin/python -m engine.attribution` (causes sum exactly; one pushed deal is named alone) and
`cd server && node --test` (CSV validation).
