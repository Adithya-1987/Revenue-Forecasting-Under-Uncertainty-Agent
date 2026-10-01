# Rangefinder

CRM revenue forecast as a range, with an exact explanation of every change between runs.

```
web/      React + Vite + Tailwind + Recharts (the 4 screens; runs on mocks by default)
server/   Node + Express API over Supabase Postgres; POST /run starts the Python engine
engine/   Python: generator, models, Monte Carlo, snapshots, attribution, backtest
supabase/migrations/   schema (applied to project vwmftyrxospghiupzaxa)
```

## Flow

Landing → sign up / sign in (Supabase email + password) → name your workspace → Data: upload a pipeline CSV
(template on the page) or load the sample company → first forecast runs → Dashboard. Each week, re-upload the
pipeline and **What changed** explains the difference, deal by deal.

## Run

1. `cp .env.example .env` and fill in the Supabase URL, anon key and `SUPABASE_DB_URL`
   (Supabase > Connect > Session pooler URI, password URL-encoded). Optional: `GEMINI_API_KEY` for chat.
2. Apply `supabase/migrations/*.sql` in order to your Supabase project.
3. Python engine: `python3 -m venv engine/.venv && engine/.venv/bin/pip install numpy scipy scikit-learn "psycopg[binary]" python-dotenv`
4. API: `cd server && npm install && npm start` (port 8787)
5. Web: `cd web && npm install && npm run dev` (http://localhost:5173)
6. For instant demo sign-ups, turn off Authentication > Email > Confirm email in Supabase.

On Windows the venv interpreter is `engine\.venv\Scripts\python.exe`; the API picks the right path itself
(override with `PYTHON=...`). The dashboard needs the API running: if `/api/*` answers 502, `cd server && npm start`.

**Demo mode** (no Supabase, no API): set `VITE_USE_MOCK=true` in `.env`, or leave `VITE_SUPABASE_URL` empty. Any email
and 8-character password signs in; the whole flow runs on the bundled sample company, stored in the browser.

**Design**: ember on frosted glass: a warm backdrop, the app in a frosted frame, translucent cards, one dark feature card per screen, Manrope type (tokens in `web/src/index.css`, mirrored for charts in `web/src/theme.tsx`), light
and dark themes, the logo in `web/src/components/Logo.tsx` (same paths as `web/public/logo.svg`). Regenerate favicons,
app icons and the social image after changing the logo: `cd web && node scripts/gen-icons.mjs`. Component sheet at `/design`.

**Deal history** (migration `0005_deal_history.sql`): database triggers log every stage move, close-date change,
value change and outcome to `deal_events`, whichever writer makes it, and keep `deals.stage_entered_at`. The CSV also
takes optional `stage_entered_at`, `team` and `payment_terms_days`. See it on Data > History.

**Models** (`engine/models.py`, `engine/season.py`): win chance from stage, silence, date pushes, size, segment,
deal age and days stalled in the current stage, corrected per rep; close timing by segment and deal size, run on a
seasonal clock learned from when deals closed (used once there are about 16 months of closes, else the plain
calendar); cash delay as each customer's payment terms stretched by its segment's lateness. Each forecast run stores
its seasonal clock (`0006_run_season.sql`) so the next run's explanation replays it exactly.

Checks: `engine/.venv/bin/python -m engine.models` (models recover the planted truth in `docs/ground_truth.md`),
`engine/.venv/bin/python -m engine.attribution` (causes sum exactly; one pushed deal is named alone) and
`cd server && node --test` (CSV validation).
