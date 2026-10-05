# Rangefinder

**Revenue forecasting under uncertainty.** Rangefinder turns a CRM pipeline into a range of outcomes
(worst, expected and best case), the honest chance of hitting target, and an exact, deal-by-deal explanation of
every change between forecast runs.

Most teams forecast with Σ deal value × stage %. That gives one number with no range, no reason when it moves,
and no idea how often it is right. Rangefinder replaces it with:

- **Win probability learned from your own history**, not fixed stage percentages: size, segment, age, time stuck
  in stage, days of silence and close-date pushes.
- **Timing**: sales-cycle length, slippage into later periods and seasonality learned from past closes.
- **Salesperson calibration**: each rep's past calls scored against what actually closed, so optimists are
  discounted and sandbaggers trusted more.
- **Cash realization**: payment terms and each customer's real payment delay, so booked and collected revenue
  are forecast separately.
- **10,000 simulated futures** for 30, 60 and 90 days, giving P10 / P50 / P90, the chance of reaching target
  and concentration risk.
- **Change attribution**: every move between two runs is split into named causes (lost, new, close date, stage,
  inactivity, calibration...) that add up to the total change to the rupee.
- **Backtesting**: the engine rewinds to past dates, forecasts with only what was known then, and reports
  coverage and error against the stage formula.

---

## Contents

- [Product tour](#product-tour)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start (demo mode)](#quick-start-demo-mode)
- [Full setup](#full-setup)
- [Environment variables](#environment-variables)
- [Forecast engine](#forecast-engine)
- [API](#api)
- [Checks and tests](#checks-and-tests)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Authors](#authors)

---

## Product tour

**Flow:** Landing → sign up / sign in (Supabase email and password) → name your workspace → *Data & targets*:
upload a pipeline CSV (template on the page), sync from Aczen Nova, or load the sample company → the first
forecast runs → *Dashboard*. Each week, re-upload the pipeline and *What changed* explains the difference,
deal by deal.

### Landing page

`/` is one scroll-driven story with no static cards. Every figure is drawn from the sample company's data
(`web/src/mocks`) and moves with the scroll, using GSAP ScrollTrigger and ScrollSmoother.

1. **Hero**: a fan of revenue paths that leans toward the pointer and collapses into one number as you scroll.
2. **How it works** (pinned): twelve real deals pop out of the CRM formula, re-score, decay with silence,
   regroup and calibrate by salesperson, run out to their payment dates, then feed 10,000 simulated futures
   that close into a range with the chance of hitting target. Hover any deal for its numbers.
3. **Try the range**: pick 30, 60 or 90 days and bookings or cash, then drag the target; the chance re-counts.
4. **Why it moved** (pinned): a waterfall from last week to this week, step by step, naming the deals behind
   each step.
5. **Proof** (pinned): twelve months of backtests drawn month by month, then the error against the stage
   formula.

With reduced motion, each scene jumps to its finished state. The scene-by-scene story is in
[`docs/landing_scroll_story.md`](docs/landing_scroll_story.md).

### App screens

| Screen | Route | What it answers |
|---|---|---|
| Dashboard | `/app` | This week at a glance: the range, chance of target, what moved and who to call |
| Forecast range | `/app/forecast` | Best, expected and worst case for 30/60/90 days, bookings or cash, against last run |
| What changed | `/app/changes` | Why the number moved: a ledger of causes and the deals behind them |
| Deal risk | `/app/risk` | Which deals carry the most expected damage, and why |
| Accuracy | `/app/trust` | Backtest coverage, error and bias, and salesperson calibration |
| Manager | `/app/manager` | The facts a marketer needs, and an assistant that drafts campaigns from them |
| Data & targets | `/app/data` | Pipeline uploads (with AI-assisted column mapping), Nova sync and revenue targets |

An assistant (chat and voice) answers questions about the forecast from the workspace's own numbers. The model
explains and tidies data; it never produces forecast numbers.

---

## Architecture

```
            Browser (React + Vite)
                   │  /api/*  (same-origin proxy: Vercel rewrite or Cloudflare Pages Function)
                   ▼
        Node + Express API (server/)  ──────►  Gemini (chat, CSV tidy-up)   ElevenLabs (voice)
          │                 │                  Aczen Nova (read-only accounting data)
          │ SQL             │ spawns
          ▼                 ▼
   Supabase Postgres  ◄──  Python engine (engine/)
   (auth, workspaces,      models → Monte Carlo → immutable snapshot → attribution → backtest
    deals, events, runs)
```

| Layer | Stack |
|---|---|
| Web | React 19, TypeScript, Vite, Tailwind CSS, Recharts, GSAP (ScrollTrigger, ScrollSmoother), Motion, lucide-react |
| API | Node 22, Express 5, `pg` |
| Engine | Python 3, NumPy, SciPy, scikit-learn, psycopg 3 |
| Data and auth | Supabase (Postgres, email/password auth, `pg_cron`) |
| AI | Google Gemini (key pool with rate limiting), ElevenLabs speech-to-text and text-to-speech |

---

## Repository layout

```
web/                  React app: landing page and app screens (runs on bundled mocks by default)
  src/pages/          one file per screen; Landing.tsx is the scroll story
  src/components/     shared UI, charts, ledger; landing/ holds one file per landing scene
  src/mocks/          the sample company's forecast, changes, accuracy, risk and history
  functions/api/      Cloudflare Pages Function that proxies /api/* to the API
server/               Express API over Supabase Postgres; POST /run starts the Python engine
  llm.js guard.js     Gemini key pool, guardrails (rate limits, on-topic and injection checks, answer cache)
  tidy.js imports.js  CSV mapping proposals and validated imports
  nova.js             Aczen Nova connector (quotations → deals, invoices and payments → close and cash dates)
  voice.js            ElevenLabs voice agent
engine/               Python forecast engine (see below)
supabase/migrations/  database schema, applied in order
docs/                 API shapes, planted ground truth, landing scroll story
render.yaml           Render blueprint for the API and engine
.github/workflows/    keep-warm ping for the hosted API
```

---

## Quick start (demo mode)

The whole app runs in the browser on the bundled sample company, with no Supabase project or API server.
Demo mode is on when `VITE_USE_MOCK=true`, or when no Supabase URL is configured.

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. Sign-in, workspaces, imports and targets are kept in the browser's local storage.

---

## Full setup

Requirements: Node 22+, Python 3, and a Supabase project.

1. **Configure:** `cp .env.example .env` and fill in the Supabase URL, anon key and `SUPABASE_DB_URL`
   (Supabase → Connect → Session pooler URI, password URL-encoded). Set `VITE_USE_MOCK=false`.
   AI and integration keys are optional (see below).
2. **Database:** apply `supabase/migrations/*.sql` in order to your Supabase project.
3. **Engine:**
   ```bash
   python3 -m venv engine/.venv
   engine/.venv/bin/pip install -r engine/requirements.txt
   ```
4. **API** (port 8787):
   ```bash
   cd server && npm install && npm start
   ```
5. **Web** (http://localhost:5173):
   ```bash
   cd web && npm install && npm run dev
   ```
6. For instant demo sign-ups, turn off *Authentication → Email → Confirm email* in Supabase.

---

## Environment variables

All variables live in one `.env` at the repository root (see `.env.example`). Never commit `.env`.
Only `VITE_`-prefixed variables reach the browser.

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | web, API | Supabase project and public key (sign-in) |
| `VITE_API_URL` | web | API base URL for the browser |
| `VITE_USE_MOCK` | web | `true` runs the app on bundled mocks |
| `SUPABASE_DB_URL` | API, engine | Postgres connection string (session pooler) |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Server-side Supabase access |
| `GEMINI_API_KEYS` (or `GEMINI_API_KEY`), `GEMINI_RPM`, `GEMINI_MODEL` | API | Assistant and CSV tidy-up; comma-separated key pool, per-key rate limit |
| `NOVA_API_KEY`, `NOVA_BASE_URL` | API | Aczen Nova pipeline sync |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL`, `ELEVENLABS_STT_MODEL` | API | Voice agent |

---

## Forecast engine

Each module is runnable on its own from the repository root.

| Module | Role | Run |
|---|---|---|
| `generate.py` | Invents two years of CRM history plus ~150 open deals from planted "true" parameters, with a full event log | `python -m engine.generate <workspace_id>` |
| `models.py` | Win probability with named factors, close timing with slippage and seasonality, cash timing, rep calibration | (used by `run`) |
| `sim.py` | Monte Carlo range (10,000 trials; P10/P50/P90, chance of target) and the exact expected value | (used by `run`) |
| `run.py` | One forecast run: models → simulation → immutable snapshot → attribution against the previous run | `python -m engine.run --workspace <id> [--as-of YYYY-MM-DD]` |
| `attribution.py` | Staged walk in a fixed cause order; causes plus residual sum exactly to the total change | `python -m engine.attribution` (self-check) |
| `backtest.py` | Rewinds to 12 past dates and forecasts with only what was known then | `python -m engine.backtest --workspace <id>` |
| `calibrate.py` | Measures range coverage and bias on several generated companies, offline | `python -m engine.calibrate` |
| `scenario.py` | Demo week: seed, run, let a realistic week happen to the pipeline, run again, backtest | `python -m engine.scenario <workspace_id> [--aczen]` |

The generator's planted parameters are listed in [`docs/ground_truth.md`](docs/ground_truth.md); the fitted
models must recover them, which is how the engine is validated.

---

## API

Shapes are documented in [`docs/api_shapes.md`](docs/api_shapes.md) and typed in `web/src/types.ts`. Money is in
rupees, probabilities are 0 to 1, dates are ISO.

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET /me` | Current user and workspace |
| `POST /workspaces`, `POST /workspaces/sample` | Create a workspace; load the sample company |
| `GET /imports`, `POST /imports`, `POST /imports/tidy` | Import history; validated CSV import; AI column-mapping proposal |
| `GET /integrations/nova`, `POST /integrations/nova/sync` | Aczen Nova status and pipeline sync |
| `GET /targets`, `PUT /targets` | Revenue targets |
| `POST /run` | Start a forecast run |
| `GET /forecast?horizon=30\|60\|90&basis=bookings\|cash` | The range for a horizon and basis |
| `GET /forecast/changes?run_id=` | Attributed changes against the previous run |
| `GET /deals/risk`, `GET /deals/:id/history` | Riskiest deals; one deal's event history |
| `GET /events` | Recent pipeline events |
| `GET /metrics/accuracy` | Backtest and calibration report |
| `GET /ai`, `POST /chat` | Assistant status; grounded chat |
| `GET /voice`, `POST /voice/speak`, `POST /voice/transcribe` | Voice agent |
| `GET /marketing`, `POST /marketing/chat` | Manager page facts and campaign assistant |

---

## Checks and tests

```bash
engine/.venv/bin/python -m engine.attribution   # causes sum exactly; one pushed deal is named alone
cd server && node --test                        # CSV validation, AI guards, Nova, voice
cd web && npm run lint                          # oxlint
cd web && npm run check                         # CSV tidy-up rules
cd web && npm run build                         # type-check and production build
```

---

## Deployment

- **API and engine:** `render.yaml` is a Render blueprint. It installs the API and a Python venv for the engine
  side by side and checks `/health`. Secrets are set in the Render dashboard.
- **Web:** a static Vite build. `web/vercel.json` rewrites `/api/*` to the API and serves `index.html` for
  client routes; on Cloudflare Pages, `web/functions/api/[[path]].js` does the same proxying using
  the `API_ORIGIN` setting.
- **Keeping the free API awake:** Supabase `pg_cron` pings `/health` every 5 minutes (migration `0008`), and the
  *Keep Render warm* GitHub workflow pings it every 10 minutes as a backup.

---

## Documentation

| File | Contents |
|---|---|
| [`docs/api_shapes.md`](docs/api_shapes.md) | Request and response shapes between the web app and the API |
| [`docs/ground_truth.md`](docs/ground_truth.md) | The planted parameters the models must recover |
| [`docs/landing_scroll_story.md`](docs/landing_scroll_story.md) | The landing page, scene by scene |
| [`Revenue-Forecasting-Build-Plan.pdf`](Revenue-Forecasting-Build-Plan.pdf) | The original build plan |

---

## Authors

- [@Adithya-1987](https://github.com/Adithya-1987)
- [@im-notpranav](https://github.com/im-notpranav)
