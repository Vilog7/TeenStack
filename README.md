# TeenStack — Student Networking & Learning Platform

A dark-futuristic, spring-morphing Indian student networking, portfolio, and learning ecosystem built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Motion for React (`motion/react`)**, **Node 24**, and a **38-table PostgreSQL database** (with native SQLite + static fallback support).

## Project Structure

- **`frontend/`** — React 19 + TypeScript + Tailwind v4 UI (`src/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `dist/`)
- **`backend/`** — HTTP REST router (`index.mjs`), cryptography & rate limiting (`security.mjs`), Signzy age verification & parental consent engine (`signzy_age_verification.mjs`, `verification_engine.mjs`), platform domain logic (`platform_domains.mjs`, `backend_services.mjs`), and automated test suites (`tests/*.test.mjs`)
- **`database/`** — 38-table PostgreSQL schema, `PL/pgSQL` triggers & views (`postgresql/`), dual-driver PostgreSQL engine (`postgres_db.mjs`), SQLite schema & initializer (`sqlite/`, `sqlite_db.mjs`), seed catalog (`seed_data.mjs`), Docker Compose (`docker-compose.postgres.yml`), and persisted data (`data/`)
- **`storage/`** — Binary media upload & magic-byte validation engine (`media_storage.mjs`) and uploaded media files (`uploads/`)

## Quick Start

```bash
npm install
npm run db:migrate
npm run dev
```

- **Frontend (Vite):** `http://localhost:5173`
- **Backend API & PostgreSQL (`backend/index.mjs`):** `http://127.0.0.1:3001`
- **Run All Tests:** `npm test`
- **Demo Student Account:** `arav@teenstack.edu` / `TeenStack@2026`
