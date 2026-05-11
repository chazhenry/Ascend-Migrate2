# GitHub Copilot Instructions — Project Migrate

## Project Overview
Project Migrate is a multi-stage data migration web application that guides users through converting acquired accounting firm data into CCH Axcess Practice format. It is a stateful, stage-based pipeline with AI-assisted schema enrichment, field mapping, ETL code generation, and output packaging.

---

## Stack — Non-Negotiable

### Frontend
- **Language:** TypeScript only. Never plain JavaScript. Every file is `.ts` or `.tsx`.
- **Framework:** React 18 with functional components and hooks only. No class components.
- **Build tool:** Vite
- **Component library:** shadcn/ui (Radix primitives + Tailwind CSS)
- **Styling:** Tailwind CSS utility classes only. No CSS modules, no styled-components, no inline style objects.
- **State management:** React Query (TanStack Query v5) for all server state. Zustand for local UI state where needed.
- **Routing:** React Router v6
- **Forms:** React Hook Form + Zod for all form validation
- **HTTP client:** Axios with a typed API client wrapper (`src/lib/api.ts`)
- **Icons:** lucide-react only
- **File uploads:** react-dropzone
- **Streaming:** EventSource (native browser API) for SSE job log streams

### Backend
- **Language:** Python 3.11+
- **Framework:** FastAPI with async route handlers
- **ORM:** SQLAlchemy 2.0 (async) with Alembic for migrations
- **Validation:** Pydantic v2 models for all request/response schemas
- **Auth:** JWT tokens (python-jose) + bcrypt password hashing (passlib)
- **AI calls:** Anthropic Python SDK — server-side only, never exposed to the frontend
- **Background jobs:** FastAPI BackgroundTasks for long-running stages; job status persisted to Postgres
- **SSE:** FastAPI StreamingResponse for log streaming
- **Environment:** python-dotenv for config

### Database
- **App DB:** PostgreSQL 18 — stores users, acquisitions, artifacts, jobs, discovery answers, manifest overrides
- **Source DB:** Separate PostgreSQL server, separate schema — accessed via per-acquisition connection config stored server-side. The app connects dynamically using credentials stored in the acquisition record. Never hardcode source DB credentials.

### Repository Structure
```
project-migrate/
├── .github/
│   └── copilot-instructions.md
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── auth.py
│   │   │   │   ├── acquisitions.py
│   │   │   │   ├── files.py
│   │   │   │   ├── stages.py
│   │   │   │   ├── jobs.py
│   │   │   │   └── artifacts.py
│   │   │   └── deps.py          # FastAPI dependencies (get_db, get_current_user)
│   │   ├── core/
│   │   │   ├── config.py        # Settings via pydantic-settings
│   │   │   ├── security.py      # JWT + bcrypt
│   │   │   └── database.py      # Async SQLAlchemy engine + session factory
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── services/            # Business logic, one file per domain
│   │   │   ├── stage_1_detect.py
│   │   │   ├── stage_2_enrich.py
│   │   │   ├── stage_3_discover.py
│   │   │   ├── stage_4_map.py
│   │   │   ├── stage_5_generate.py
│   │   │   ├── stage_6_validate.py
│   │   │   └── stage_7_output.py
│   │   ├── prompts/             # AI system prompts as .md files, loaded at runtime
│   │   │   ├── enrich_system.md
│   │   │   ├── discover_system.md
│   │   │   └── mapping_engine.md
│   │   ├── signatures/          # Source system fingerprint libraries as JSON
│   │   │   ├── practice_engine.json
│   │   │   ├── quickbooks.json
│   │   │   ├── proformafx.json
│   │   │   └── thomson_reuters.json
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui generated components
│   │   │   ├── layout/          # AppShell, Sidebar, Header
│   │   │   └── stages/          # One folder per stage: Stage1/, Stage2/, etc.
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── AcquisitionList.tsx
│   │   │   └── AcquisitionWorkspace.tsx
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/
│   │   │   ├── api.ts           # Typed Axios client
│   │   │   └── utils.ts
│   │   ├── stores/              # Zustand stores
│   │   ├── types/               # Shared TypeScript types mirroring Pydantic schemas
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── .gitignore
└── README.md
```

---

## Coding Conventions

### TypeScript / React
- All React components are arrow functions with explicit return types: `const MyComponent = (): JSX.Element => {}`
- All props interfaces are named `[ComponentName]Props` and defined directly above the component
- No `any` types. Use `unknown` and narrow, or define a proper type.
- All API response types are defined in `src/types/` and match their Pydantic counterparts exactly
- React Query keys are string arrays defined as constants in `src/lib/queryKeys.ts`
- All forms use `useForm<z.infer<typeof schema>>()` pattern
- Loading states always use the shadcn/ui `Skeleton` component — never spinners in isolation
- Errors always surface in a shadcn/ui `Alert` with `variant="destructive"`

### Python / FastAPI
- All route handlers are `async def`
- All database operations use async SQLAlchemy sessions via dependency injection
- All Pydantic models use `model_config = ConfigDict(from_attributes=True)`
- Services never import from `api/routes/` — dependency flows one way: routes → services → models
- All AI calls are wrapped in try/except with structured error logging
- Long-running jobs always write status updates to the `jobs` table so SSE can stream them
- All prompts are loaded from `.md` files, never hardcoded in Python

### General
- Every environment variable has a corresponding entry in `.env.example` with a placeholder value
- No secrets in source control — `.env` is always in `.gitignore`
- All Alembic migrations are auto-generated (`alembic revision --autogenerate`) and reviewed before committing

---

## Git Files Required
- `.gitignore` — must exclude: `__pycache__`, `*.pyc`, `.env`, `node_modules`, `dist`, `.vite`, `*.egg-info`, `alembic/versions/*.pyc`
- `README.md` — must include: project description, local dev setup for both frontend and backend, environment variables list, how to run Alembic migrations
- `.env.example` — must include all required env vars with placeholder values

---

## Environment Variables (backend)
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/project_migrate
SECRET_KEY=changeme
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ANTHROPIC_API_KEY=sk-ant-...
```

## Environment Variables (frontend)
```
VITE_API_BASE_URL=http://localhost:8000
```
