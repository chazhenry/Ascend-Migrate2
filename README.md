# Project Migrate

Project Migrate is a full-stack migration workspace for converting acquired accounting firm data into CCH Axcess Practice format. Each acquisition is a stateful project record that moves through seven pipeline stages: source detection, schema enrichment, discovery, mapping review, ETL generation, validation, and output packaging. The application keeps those stages connected through persisted jobs, artifacts, and human review gates so migration work remains auditable and restartable.

The backend provides FastAPI APIs, async SQLAlchemy models, background job execution, artifact storage, and AI-assisted schema and mapping workflows. The frontend provides a React 18 Vite application with a stage-driven workspace, artifact drawer, schema-enrichment utility, and protected acquisition routes backed by TanStack Query and Zustand.

## Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+

## Local Setup

1. Clone the repository.
2. Create and activate a backend virtual environment.
3. Install backend dependencies with `pip install -r backend/requirements.txt`.
4. Install frontend dependencies with `cd frontend && npm install`.
5. Copy `backend/.env.example` to `backend/.env` and fill in the required values.
6. Copy `frontend/.env.example` to `frontend/.env` if you need to override the default API URL.
7. Run Alembic migrations with `cd backend && alembic upgrade head`.
8. Start the backend with `cd backend && uvicorn app.main:app --reload`.
9. Start the frontend with `cd frontend && npm run dev`.
10. Or install root dependencies with `npm install` and run both from the workspace root with `npm run turbo`.

## Environment Variables

| Variable | Location | Description |
| --- | --- | --- |
| `DATABASE_URL` | `backend/.env` | Async SQLAlchemy connection string for the Project Migrate PostgreSQL database. |
| `SECRET_KEY` | `backend/.env` | Key used for JWT signing and source credential encryption. |
| `ALGORITHM` | `backend/.env` | JWT signing algorithm. Default is `HS256`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `backend/.env` | Access token lifetime in minutes. Default is 480 minutes (8 hours). |
| `ANTHROPIC_API_KEY` | `backend/.env` | Anthropic API key used for schema enrichment, discovery, and mapping generation. |
| `DEEPSEEK_API_KEY` | `backend/.env` | DeepSeek API key for configurable LLM-backed workflows. |
| `OPENAI_API_KEY` | `backend/.env` | OpenAI API key for configurable LLM-backed workflows. |
| `DEFAULT_LLM_PROVIDER` | `backend/.env` | Backend default LLM provider. Use `deepseek` or `openai`. |
| `CORS_ORIGINS` | `backend/.env` | JSON array of allowed frontend origins for browser access. |
| `VITE_API_BASE_URL` | `frontend/.env` | Base URL for the frontend API client. Default is `/api/v1` and is proxied to `http://localhost:8000` during local dev. |

## Adding a New Source System Signature

Signature files live in `backend/app/signatures/` and are plain JSON fingerprint definitions used by Stage 1 source-system detection. Each file must contain:

- `system_name`: Human-readable source system name.
- `version_hint`: Optional version clue surfaced to the UI.
- `required_tables`: Array of tables that must all be present for a strong match.
- `scored_columns`: Array of `table.column` identifiers that add confidence when present.
- `max_score`: Maximum attainable score for normalization.

A typical signature looks like this:

```json
{
  "system_name": "Practice Engine",
  "version_hint": "v2.x",
  "required_tables": ["tblclient", "tblengagement", "tbstaff"],
  "scored_columns": [
    "tblclient.clientid",
    "tblengagement.engagementid",
    "tbstaff.staffid"
  ],
  "max_score": 12
}
```

After adding a new file, restart the backend and rerun Stage 1 for an acquisition with representative schema files so the new signature participates in scoring.
