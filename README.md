# SIPROCOM — SGS (Système de Gestion de Stock)

Bilingual (FR/EN) stock management system: stock entries, stock issues, real-time
multi-warehouse stock levels, threshold alerts, and product trend analytics.

> **Development is driven by [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).**
> Conventions and hard rules live in [CLAUDE.md](CLAUDE.md).

## Stack

| | |
|---|---|
| Frontend | React 19 · Vite 8 · Tailwind 4 · react-i18next · React Query · Recharts |
| Backend | Node 24 · Express 5 · Prisma 6 · PostgreSQL · JWT (httpOnly cookie) |
| Hosting | Vercel + Neon (free tier) — Docker path documented for on-premise |

## Prerequisites

- Node.js 20+ (developed on 24)
- A PostgreSQL database — [Neon](https://neon.tech) free tier is the default choice

## Setup

### 1. Database

Create a free project at [neon.tech](https://neon.tech), then copy both connection
strings (pooled and direct).

### 2. Server

```bash
cd server
npm install
cp .env.example .env      # then fill in DATABASE_URL and DIRECT_URL
npm run db:migrate        # creates the schema
npm run db:seed           # demo data (Phase 1)
npm run dev               # http://localhost:4000
```

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Client

```bash
cd client
npm install
npm run dev               # http://localhost:5173
```

Vite proxies `/api` to `localhost:4000`, so the browser sees a single origin and the
auth cookie behaves exactly as it will in production.

### 4. Verify

Open <http://localhost:5173/status> — the page reports API, database, environment and
locale. Switch FR ↔ EN with the toggle to confirm i18n is wired.

## Scripts

### Server

| Command | Purpose |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm run db:migrate` | Create/apply a migration locally |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Browse data in Prisma Studio |
| `npm run db:reset` | Drop, re-migrate and re-seed |

### Client

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | oxlint |
| `npm run i18n:check` | **Fail if FR and EN translations have drifted** |

## Project layout

```
client/src/
  api/         axios instance, one module per resource
  components/  shared UI
  features/    one folder per domain module
  hooks/
  i18n/        locales/{en,fr}/*.json
  lib/         formatters, permissions, exporters
server/src/
  config/      validated env access
  lib/         prisma, logger, errors
  middleware/  auth, authorize, errorHandler
  routes/      HTTP layer — parse + authorize only
  services/    business logic, owns transactions
  validators/  zod schemas
```

**Layering rule:** `routes → services → prisma`. Stock mutations happen only in
`services/stock.service.js`.

## Status

Phase 0 (Foundations) complete. See the progress tracker at the bottom of
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
