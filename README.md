# Analysis Studio

A full-stack data analysis platform that lets you upload CSV datasets, explore them through an automated report, and run machine learning experiments — all from a single interface.

Built with **Next.js 16** on the frontend and **FastAPI** on the backend, the app handles everything from file upload and profiling to supervised benchmarks and unsupervised clustering, then saves every result for later download.

---

## Screenshots

### Authentication

<p align="center">
  <img src="docs/screenshots/01.png" width="48%" alt="Login page" />
  <img src="docs/screenshots/02.png" width="48%" alt="Sign-up with real-time validation" />
</p>

Login and sign-up screens with real-time availability checks on username and email. Passwords are validated against a strength policy and confirmed inline.

<p align="center">
  <img src="docs/screenshots/03.png" width="48%" alt="Email verification with 6-digit code" />
</p>

Email-verified login with a 6-digit code, resend timer, and countdown display.

---

### Dashboard

<p align="center">
  <img src="docs/screenshots/04.png" width="48%" alt="Dashboard overview" />
  <img src="docs/screenshots/05.png" width="48%" alt="Studio pages and analysis breakdown" />
</p>

The dashboard shows saved run stats, a getting-started workflow (Upload → Analyse → Export), recent uploads, and an activity feed. The studio pages panel links to the dataset library, analysis workspace, run archive, and account settings. The analysis breakdown card shows the six report sections and how they connect.

---

### Uploads

<p align="center">
  <img src="docs/screenshots/06.png" width="80%" alt="Uploads page with dataset library and quality preview" />
</p>

Drag-and-drop CSV upload with a dataset library on the right. Selecting a dataset shows an instant quality preview — completeness, duplicates, and an overall quality score — before opening the full analysis.

---

### Analysis Workspace

<p align="center">
  <img src="docs/screenshots/07.png" width="80%" alt="Analysis workspace landing" />
</p>

The analysis workspace loads the active dataset and shows a summary card (row count, column count, type mix, strongest correlations) alongside an analysis map with five section cards: Overview, Data Health, Schema, Charts, and ML Lab.

#### Overview

<p align="center">
  <img src="docs/screenshots/08.png" width="80%" alt="Overview tab — dataset summary" />
</p>

The Overview tab includes a plain-language summary, a dataset posture panel (compact shape, density, target candidates, quality score), stat cards, a type-mix breakdown, and a suggested reading order.

#### Data Health

<p align="center">
  <img src="docs/screenshots/09.png" width="80%" alt="Data health — quality score and recommendations" />
</p>

Quality score, missingness breakdown per column, and cleanup recommendations. The score drops for missing values, duplicates, constant columns, correlations, and outliers.

#### Charts

<p align="center">
  <img src="docs/screenshots/10.png" width="48%" alt="Distribution histogram and missingness" />
  <img src="docs/screenshots/11.png" width="48%" alt="Boxplot summary and correlation heatmap" />
</p>

Six chart types are generated automatically: missingness bar chart, value distribution histogram, top categories, boxplot summaries with outlier counts, a correlation heatmap, and pairwise scatter plots. Each chart includes an explanation of what it shows and why it matters.

#### ML Lab — Supervised

<p align="center">
  <img src="docs/screenshots/12.png" width="48%" alt="Supervised lab — target recommendations" />
  <img src="docs/screenshots/13.png" width="48%" alt="Supervised lab — run setup and saved runs" />
</p>

The supervised lab ranks columns by fit score as potential prediction targets. Pick a target and launch a benchmark across Logistic Regression / Linear Regression, Random Forest, and Extra Trees. Results are saved and can be reopened or downloaded.

<p align="center">
  <img src="docs/screenshots/14.png" width="48%" alt="Supervised benchmark results — model scores and feature importance" />
  <img src="docs/screenshots/15.png" width="48%" alt="Target vs feature slices" />
</p>

Benchmark results include a model score comparison bar chart, feature importance rankings, a prediction review table (actual vs predicted), and target-vs-feature slice breakdowns showing how each feature band maps to the target's average value.

<p align="center">
  <img src="docs/screenshots/17.png" width="80%" alt="Supervised downloads and feature slice detail" />
</p>

Each saved supervised run can be downloaded as a full report or a summary file. Delete buttons are available per run.

#### ML Lab — Unsupervised

<p align="center">
  <img src="docs/screenshots/18.png" width="48%" alt="Unsupervised lab setup — clustering config" />
  <img src="docs/screenshots/19.png" width="48%" alt="Unsupervised results — cluster distribution and anomaly severity" />
</p>

The unsupervised lab runs KMeans clustering and Isolation Forest anomaly detection. Configure the cluster count, launch the scan, and review cluster distribution charts and an anomaly severity scale.

<p align="center">
  <img src="docs/screenshots/20.png" width="80%" alt="Top anomaly candidates and unsupervised downloads" />
</p>

Anomaly candidates are listed with scores and PCA coordinates. Results can be saved, reopened, downloaded, or deleted.

---

### Run Archive

<p align="center">
  <img src="docs/screenshots/21.png" width="80%" alt="History page — saved runs archive" />
</p>

Browse all saved runs with search, readiness filters, and ML history filters. Each row shows the dataset name, tags (ML-ready, Unsupervised ML), a summary, status, date, and version. Actions include opening the full report popup, downloading reports, and deleting runs.

---

### Account Settings

<p align="center">
  <img src="docs/screenshots/22.png" width="80%" alt="Account settings page" />
</p>

Manage profile details (name, date of birth, username, email, password), session settings (remember login, two-factor authentication toggle), and danger-zone actions (delete saved runs, delete account with email verification).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Charts | Recharts |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2 |
| Database | PostgreSQL (psycopg v3) |
| ML | scikit-learn, XGBoost, pandas |
| Auth | JWT (access + refresh tokens), bcrypt, email-verified login |
| Deploy | Vercel (frontend), Railway (backend) |

---

## Project Structure

```
backend/
  app/
    api/routes/       # Auth, analysis, and health endpoints
    core/             # Config, database, security, email
    models/           # SQLAlchemy models (users, tokens, analyses)
    schemas/          # Pydantic request/response schemas
    services/         # Business logic — auth, profiling, statistics,
                      #   insights, ML reporting, visualisations
frontend/
  app/                # Next.js pages (dashboard, analysis, batch,
                      #   history, account, login, signup)
  components/         # UI shells, analysis tabs, account dialogs
  lib/                # API clients, auth helpers, analysis logic
```

---

## Features

- **CSV upload and dataset library** — drag-and-drop upload, persistent library, instant quality preview
- **Automated profiling** — row/column stats, type detection, role inference (identifiers, targets, numeric, categorical)
- **Data quality scoring** — weighted score from missingness, duplicates, constants, correlations, and outliers
- **Insights engine** — plain-language findings and cleanup recommendations generated from the profile
- **Six chart types** — missingness, distributions, categories, boxplots, correlation heatmap, pairwise scatter
- **Drift detection** — early-vs-late row comparison to flag distribution shifts within the file
- **Supervised ML benchmarks** — target selection with fit-score ranking, three model families, train/test holdout, feature importance, prediction review, target–feature slices
- **Unsupervised ML scans** — KMeans clustering, Isolation Forest anomaly detection, PCA 2D projection
- **Run archive** — searchable history with filters, popup report viewer, report and summary downloads
- **Email-verified auth** — sign-up with availability checks, 6-digit login codes, password reset, remember-me tokens
- **Two-factor authentication** — optional email-based 2FA toggle
- **Account management** — profile editing, session management, saved-data cleanup, account deletion with verification
- **Responsive design** — custom mobile layout with accordion sections, slide navigation, and phone-optimised charts

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r ../requirements.txt

# Create a .env file with at minimum:
#   DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/analysis_platform
#   SECRET_KEY=your-secret-key

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and expects the backend at `http://localhost:8000`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SECRET_KEY` | Yes | JWT signing key |
| `FRONTEND_URL` | No | Frontend URL for email links (default: `http://localhost:3000`) |
| `EMAIL_HTTP_ENDPOINT` | No | Full outbound email endpoint URL |
| `EMAIL_HTTP_AUTH_NAME` | No | Optional auth username for outbound email endpoint |
| `EMAIL_HTTP_AUTH_VALUE` | No | Auth credential for outbound email endpoint |
| `EMAIL_HTTP_TIMEOUT_SECONDS` | No | Timeout for outbound email requests |
| `EMAIL_FROM` | No | Sender address for auth emails |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `COOKIE_SECURE` | No | Set `true` in production |

---

## Deployment

- **Frontend** — deployed to Vercel. Config in `frontend/vercel.json`.
- **Backend** — deployed to Railway. Config in `railway.toml` and `backend/Dockerfile`.

---

## License

This project is not currently under an open-source license. All rights reserved.
