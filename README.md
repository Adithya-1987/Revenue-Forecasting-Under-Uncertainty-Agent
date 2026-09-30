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

Checks: `engine/.venv/bin/python -m engine.attribution` (causes sum exactly; one pushed deal is named alone) and
`cd server && node --test` (CSV validation).
