# SIPROCOM - SGS (Système de Gestion de Stock)
## Implementation Plan & Step-by-Step Build Guide

> **This document is the single source of truth for the development process.**
> Read it before starting any task. Update the checkboxes as work completes.
> Source requirement: `Cahier_des_charges_SIPROCOM_SGS.pdf` v1.0 (07/08/2026).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Recommended Tech Stack](#2-recommended-tech-stack)
3. [Cost Analysis](#3-cost-analysis)
4. [Architecture](#4-architecture)
5. [Data Model](#5-data-model)
6. [Business Rules (non-negotiable)](#6-business-rules-non-negotiable)
7. [Bilingual (EN/FR) Strategy](#7-bilingual-enfr-strategy)
8. [API Surface](#8-api-surface)
9. [Screen Inventory](#9-screen-inventory)
10. [Step-by-Step Build Phases](#10-step-by-step-build-phases)
11. [Testing Strategy](#11-testing-strategy)
12. [Deployment](#12-deployment)
13. [Acceptance Criteria Traceability](#13-acceptance-criteria-traceability)
14. [Risks & Decisions Pending](#14-risks--decisions-pending)
15. [Glossary FR ↔ EN](#15-glossary-fr--en)

---

## 1. Executive Summary

> **Scope note (2026-08-17).** SIPROCOM operates a single site, and this application
> serves SIPROCOM alone. The warehouse dimension has been removed entirely - stock is
> "this product", not "this product in that warehouse" - and with it transfers (BR-7).
> Sections below that still read `warehouseId` describe the original design and are
> superseded by Phase 9 at the end of this document.

**What we are building:** a web-based stock management system for SIPROCOM's warehouse,
covering stock entries (entrées), stock exits (sorties), real-time stock levels,
threshold alerts, and trend analytics ("produits tendance" / high-rotation
products), with role-based access and full audit traceability.

**Approach:** a single monorepo containing a React SPA (`client/`) and an Express REST API
(`server/`) backed by PostgreSQL via Prisma. Deployed on free-tier serverless
infrastructure, with a documented path to on-premise Docker hosting if SIPROCOM chooses an
internal server.

**Estimated effort:** 10-14 weeks total (matches the cahier des charges planning), of which
~6-8 weeks of actual development across 8 sprints defined in §10.

**Key differences vs. a naive stock app** - these drive most of the design:

| Requirement | Design consequence |
|---|---|
| Stock is a fast-changing counter | Dedicated `StockLevel` table, one row per product - not an integer on `Product`, whose row would then lock on every sale |
| "Aucune sortie ne peut rendre le stock négatif" | Atomic conditional decrement inside a DB transaction - never read-then-write |
| Full traceability (qui, quoi, quand, combien) | Append-only `StockMovement` ledger + `AuditLog`; movements are never edited or deleted |
| Documents have a validation step | `DRAFT → VALIDATED → CANCELLED` state machine; stock only moves on `VALIDATED` |
| Trend analysis over periods | Movement ledger is queried by date range; no separate analytics DB needed at this scale |
| French UI, no hardcoded strings | Every label goes through `t()`. The bilingual ambition of §7 was narrowed to French only - `SUPPORTED_LANGUAGES` holds one entry - but the i18n layer stays, so a second language is a file plus one line |

---

## 2. Recommended Tech Stack

Chosen for three constraints, in priority order: **(1) near-zero running cost**,
**(2) sub-2s response on common operations** (NFR from §5 of the spec), **(3) skills you
already have** - this stack matches your existing Stocks-master project, so there is no
learning curve and patterns can be reused directly.

### 2.1 Frontend

| Concern | Choice | Why |
|---|---|---|
| Framework | **React 19** | Ecosystem, your existing experience |
| Build tool | **Vite 8** | Instant HMR, tiny production bundles, zero config |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) | No CSS files to maintain, purges to ~10 KB, fast to build tablet-friendly layouts |
| Routing | **react-router-dom 7** | Standard |
| i18n | **i18next + react-i18next + i18next-browser-languagedetector** | The bilingual requirement; auto-detects browser locale, persists choice |
| Data fetching | **axios** + a thin `useApi` hook | Interceptors for auth + 401 handling in one place |
| Server state | **@tanstack/react-query v5** | *New vs. Stocks-master.* Caching + auto-refetch is what makes "temps réel" stock levels feel instant and keeps the <2s NFR without hand-rolled cache code. Worth the one dependency. |
| Charts | **Recharts 3** | Declarative, React-native, good enough for the dashboard curves/rankings |
| Tables | Hand-rolled + **@tanstack/react-table** if columns grow complex | Start simple |
| Forms | **react-hook-form** + **zod** | Client validation sharing the same zod schemas as the server |
| Notifications | **react-hot-toast** | Lightweight |
| Icons | **react-icons** | |
| Excel export | **SheetJS (`xlsx`)** client-side | No server load, instant download |
| PDF export | **pdfmake** (or `html2pdf.js` for visual reports) | Client-side, keeps serverless functions cheap and fast |
| Barcode scan | **@zxing/browser** (optional, Phase 2) | Tablet camera scanning for magasiniers |

### 2.2 Backend

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Node.js 24 LTS** | Installed locally (v24.14.0) |
| Framework | **Express 5** | Simple, serverless-compatible, matches your existing code |
| ORM | **Prisma 6** | Type-safe queries, migrations, and - critically - `$transaction` for atomic stock updates |
| Database | **PostgreSQL 16** | Transactions + row locking are mandatory here; also gives us window functions for rotation analytics |
| Auth | **JWT in httpOnly cookie** + **bcryptjs** | Meets "chiffrement des mots de passe"; httpOnly beats localStorage for XSS safety |
| Validation | **zod** | Shared schemas with the client |
| Logging | **pino** | Structured logs, cheap |
| Transactional email | **None** | Removed 2026-08-22. Codes and reset links are handed over by the administrator - see Phase 9 |
| Rate limiting | **express-rate-limit** on `/auth/*` | Brute-force protection |
| Scheduled alert sweep | **Vercel Cron** (free) or `node-cron` if self-hosted | §7.3 "surveille en continu" |

### 2.3 Infrastructure

| Concern | Choice (Cloud) | Alternative (On-premise) |
|---|---|---|
| Database | **Neon** PostgreSQL - free tier, serverless, branching | PostgreSQL 16 in Docker on SIPROCOM server |
| API hosting | **Vercel** serverless functions (free) | Node + PM2 behind Nginx in Docker |
| Frontend hosting | **Vercel** static/CDN (free) | Nginx serving the Vite build |
| File storage | Not needed in v1 | - |
| Backups | Neon automatic PITR (7 days on free tier) | `pg_dump` cron → external disk, documented restore procedure |
| Monitoring | Vercel logs + **Sentry** free tier | pino → file + logrotate |

> **Decision needed (§8 of the spec, §14 below):** cloud vs. internal server. The code is
> written to run in both - the only differences are `DATABASE_URL` and the deploy step.
> Build cloud-first; the Docker path is a 1-day addition.

### 2.4 Deliberately rejected

| Option | Why not |
|---|---|
| Next.js | We need a plain REST API consumable by future mobile/tablet clients; the SPA + Express split is clearer and cheaper to reason about here |
| MongoDB | Stock integrity requires ACID transactions and constraints; a relational model is the correct fit |
| Microservices | Massive overkill for one warehouse operation; a modular monolith is faster and cheaper |
| GraphQL | Adds tooling weight for no benefit at this API size |
| Redux | React Query + Context covers all state needs here |
| Paid BI tool | Recharts + SQL aggregation covers §4.6 entirely |

---

## 3. Cost Analysis

**Monthly running cost target: €0 for v1, scaling to ~€25/month only if usage demands it.**

| Item | Free tier | When you'd pay |
|---|---|---|
| Neon PostgreSQL | 0.5 GB storage, 190 compute-hours/mo | ~€19/mo beyond - this DB will hold years of movements before hitting 0.5 GB |
| Vercel Hobby | 100 GB bandwidth, serverless functions | €20/mo Pro - needed only if SIPROCOM requires a commercial licence or custom SLA |
| Resend | 3 000 emails/mo | €18/mo - alert volume will be far under this |
| Sentry | 5 000 errors/mo | Rarely exceeded |
| Domain name | - | ~€12/year |

**On-premise alternative:** €0 recurring beyond the existing server + electricity, but adds
sysadmin burden (backups, TLS certs, uptime). Recommend cloud for v1; revisit at scale.

---

## 4. Architecture

```
Siprocom/
├── IMPLEMENTATION_PLAN.md      ← this file
├── CLAUDE.md                   ← dev conventions, points here
├── README.md
├── client/                     React 19 + Vite SPA
│   ├── src/
│   │   ├── api/                axios instance + one module per resource
│   │   ├── components/         reusable UI (Table, Modal, Badge, StatCard…)
│   │   ├── features/           one folder per domain module
│   │   │   ├── auth/
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── suppliers/
│   │   │   ├── receipts/       bons d'entrée
│   │   │   ├── issues/         bons de sortie
│   │   │   ├── adjustments/    inventaire
│   │   │   ├── alerts/
│   │   │   ├── reports/
│   │   │   ├── users/
│   │   │   └── dashboard/
│   │   ├── hooks/
│   │   ├── i18n/
│   │   │   ├── index.js
│   │   │   └── locales/{en,fr}/{common,products,stock,reports,errors}.json
│   │   ├── layouts/
│   │   ├── lib/                formatters, permissions, exporters
│   │   └── routes/
│   └── vite.config.js
└── server/                     Express 5 + Prisma API
    ├── index.js                app bootstrap
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.js
    └── src/
        ├── config/
        ├── lib/                prisma client, mailer, logger
        ├── middleware/         authenticate, authorize(roles), errorHandler, auditLog
        ├── routes/             one router per resource
        ├── services/           ← business logic lives HERE, not in routes
        │   ├── stock.service.js       the atomic movement engine
        │   ├── alert.service.js
        │   └── analytics.service.js
        ├── validators/         zod schemas
        └── utils/
```

**Layering rule:** routes parse/authorize → services hold business logic and own
transactions → Prisma touches the DB. **No Prisma calls that mutate stock outside
`stock.service.js`.** This single rule is what keeps stock integrity provable.

---

## 5. Data Model

Prisma schema, PostgreSQL. Maps directly onto §6 of the cahier des charges, extended where
the spec is under-specified.

> **The schema itself lives in `server/prisma/schema.prisma`, and that file is
> authoritative.** A second copy here drifted out of date twice; what follows is the
> shape and the reasoning, not a transcription to keep in sync.

**Enums** - `Role`, `Packaging`, `MovementType`, `DocStatus`, `EntryReason`,
`IssueReason`, `AlertType`, `AlertStatus`, `AccountTokenType`.

| Model | Purpose | The decision worth knowing |
|---|---|---|
| `User` | Internal accounts | `password` is **nullable** - null means "invited, not yet activated" (BR-11) |
| `AccountToken` | Invitation + password reset | One table, two types. Stores the SHA-256 of the token only; single-use; reissuing supersedes the last |
| `Category` | Two-level tree | `@@unique([name, parentId])`. Deeper nesting would break the reporting group-bys |
| `Supplier` | | Soft-deleted via `isActive` - receipts reference it forever |
| `Product` | Catalogue | Carries the carton factor (`unitsPerCarton`) and both price lists; stock is always held in the base unit |
| `ProductSupplier` | Join | Last purchase price per pair |
| `StockLevel` | Materialised stock | **One row per product**, `productId @unique`. That index is what the BR-2 decrement targets |
| `StockMovement` | Append-only ledger | Never updated, never deleted (BR-4). The `balanceAfter` snapshot makes audits trivial |
| `GoodsReceipt` + `Line` | Bon d'entrée | `baseQuantity` is stored, not recomputed: changing a carton factor must not rewrite posted history |
| `GoodsIssue` + `Line` | Bon de sortie | Customer kept as plain columns - a shop sells to walk-ins as often as to regulars |
| `Alert` | Threshold breaches | One OPEN alert per (product, type) - BR-8 |
| `AuditLog` | Traceability | §4.7: who, what, when |
| `Counter` | Gapless numbering | `UPDATE … RETURNING` inside the document transaction (BR-10) |

### Why `StockLevel` is a table, not a SQL view

The spec calls Stock a "vue calculée". Computing `SUM(movements)` on every read would
breach the <2s NFR once the ledger grows past a few hundred thousand rows. Instead we keep
a materialised row updated **inside the same transaction** as the movement, and provide a
`GET /api/stock/reconcile` admin endpoint that recomputes from the ledger and reports any
drift. Best of both: fast reads, provable correctness.

---

## 6. Business Rules (non-negotiable)

These encode §4, §7 and §10 of the cahier des charges. Every one of them needs a test.

**BR-1 - Stock moves only on validation.**
A `DRAFT` document changes nothing. Stock is affected exactly once, when status goes
`DRAFT → VALIDATED`. Re-validating a `VALIDATED` document is a no-op error.

**BR-2 - No negative stock.**
An OUT movement must be rejected if it would drive `StockLevel.quantity` below zero.
Implement as a conditional update, never read-then-write:

```js
// inside prisma.$transaction
const updated = await tx.$executeRaw`
  UPDATE stock_levels SET quantity = quantity - ${qty}, "updatedAt" = NOW()
  WHERE "productId" = ${productId} AND quantity >= ${qty}`;
if (updated === 0) throw new InsufficientStockError(productId);
```
Two concurrent magasiniers issuing the last unit: one succeeds, one gets a clean 409.

**BR-3 - Override is explicit and privileged.**
Spec: *"sauf autorisation explicite d'un profil habilité."* Only `ADMIN` may pass
`allowNegative: true`, and doing so writes an `AuditLog` entry with reason mandatory.

**BR-4 - Movements are immutable.**
No UPDATE or DELETE on `stock_movements`. To correct an error, cancel the document
(which posts compensating movements) or record an `ADJUSTMENT`.

**BR-5 - Every movement is attributed.**
`userId` and `createdAt` are required. There is no system-anonymous movement; scheduled
jobs use a dedicated `system@siprocom` user.

**BR-6 - Adjustments require a reason.**
`POST /api/stock/adjust` rejects an empty `reason` with 422. Reason is free text plus a
category (inventory count, breakage, correction).

**BR-7 - Withdrawn (Phase 9).**
Transfers moved goods between two sites. SIPROCOM has one, so `IssueReason.TRANSFER`,
`EntryReason.TRANSFER_IN` and the paired OUT/IN posting are gone. The number is left
unused rather than reassigned, so references to BR-7 elsewhere still resolve.

**BR-8 - Alerts are automatic.**
After every committed movement, `alert.service.checkThresholds()` runs. It opens an alert
when `quantity < minThreshold` (or `> maxThreshold`) and auto-resolves the open alert when
stock returns to normal. No duplicate OPEN alert for the same (product, type).

**BR-11 - Nobody sets another person's password.**
An administrator invites a colleague; the account is created with `password = null` and
an emailed single-use link lets that person choose their own. Password reset is the same
mechanism. Tokens are 256-bit, single-use, time-limited, and stored only as a SHA-256
hash. An account with a null password cannot be signed into and is reported by `/login`
exactly like a missing one.

**BR-9 - Cancelling a validated document reverses it.**
`VALIDATED → CANCELLED` posts exact compensating movements. If reversal would make stock
negative, the cancellation is refused (goods already left).

**BR-10 - Document numbers are gapless and race-safe.**
Allocated via `UPDATE counters SET value = value + 1 RETURNING value` inside the
transaction. Format: `BE-{YYYY}-{0000}` / `BS-{YYYY}-{0000}`.

---

## 7. Bilingual (EN/FR) Strategy

**Default language: French.** English fully supported. This is a first-class requirement,
not a post-hoc translation pass.

### 7.1 Rules

1. **No hardcoded user-facing string, anywhere, ever.** Every label goes through `t()`.
   A CI grep check flags literal strings in JSX text nodes.
2. **Key naming:** `namespace:section.item` - e.g. `stock:issue.validateButton`,
   `errors:insufficientStock`. Keys are English-ish and stable; never key on French text.
3. **Namespaces:** `common`, `auth`, `products`, `stock`, `reports`, `admin`, `errors`.
   Loaded per route to keep the bundle small.
4. **Language selection order:** user profile `locale` → localStorage → browser → `fr`.
   Changing it in the UI persists to the user record so it follows them across devices.
5. **Server-side messages:** the API returns **error codes**, not sentences -
   `{ error: { code: "INSUFFICIENT_STOCK", details: { productId, available } } }`.
   The client maps codes to `errors:*` keys. This keeps translation entirely in the frontend
   and makes the API locale-agnostic.
6. **Emails** are the one place the server does translate: use the recipient's
   `user.locale`, with templates in `server/src/emails/{fr,en}/`.
7. **Data vs. UI:** product designations are business data, not UI text. Provide optional
   `designationEn` / `nameEn` columns; fall back to the French value when empty. Never
   machine-translate business data.
8. **Formatting:** all dates, numbers and currency go through
   `Intl.DateTimeFormat` / `Intl.NumberFormat` with the active locale - never manual
   `toFixed` or `dd/mm/yyyy` string building. Currency: **XOF** (confirm with SIPROCOM).
9. **Exports respect the active language:** Excel/PDF column headers come from the same
   translation files as the screen.
10. **`<html lang>`** is updated on language change (accessibility + browser behaviour).

### 7.2 Skeleton

```js
// client/src/i18n/index.js
i18n.use(LanguageDetector).use(initReactI18next).init({
  fallbackLng: 'fr',
  supportedLngs: ['fr', 'en'],
  ns: ['common'],
  defaultNS: 'common',
  detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  interpolation: { escapeValue: false },
});
```

```json
// client/src/i18n/locales/fr/stock.json
{ "issue": { "title": "Bon de sortie", "validateButton": "Valider la sortie",
              "insufficient": "Stock insuffisant : {{available}} disponible(s)" } }
```
```json
// client/src/i18n/locales/en/stock.json
{ "issue": { "title": "Goods Issue", "validateButton": "Validate issue",
              "insufficient": "Insufficient stock: {{available}} available" } }
```

> **Definition of done for any UI task:** both `fr` and `en` files updated. A missing key in
> either language fails review.

---

## 8. API Surface

Base: `/api`. All routes except `/auth/login` require a valid JWT cookie.
`R` = read roles, `W` = write roles.

| Method | Endpoint | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | Sets httpOnly cookie, rate-limited |
| POST | `/auth/logout` | any | |
| GET | `/auth/me` | any | Current user + role + locale |
| PATCH | `/auth/me/locale` | any | Persist language choice |
| GET | `/auth/setup-status` | public | Is the database still empty? |
| POST | `/auth/setup` | public once | First administrator on an empty database |
| GET | `/auth/token?token=` | public | Is this emailed link still good? Does not spend it |
| POST | `/auth/set-password` | public | Consumes an invitation or reset token (BR-11), signs in |
| POST | `/auth/signup/check` | public | Is there a pending invitation for this address? Sends nothing |
| POST | `/auth/signup/complete` | public | Name + password + code; activates and signs in |
| GET/POST | `/categories` | R: all · W: ADMIN | Tree-aware |
| PATCH/DELETE | `/categories/:id` | ADMIN | Delete blocked if products attached |
| GET/POST | `/products` | R: all · W: ADMIN, MAGASINIER | Filters: category, supplier, status, stock level |
| PATCH | `/products/:id` | ADMIN, MAGASINIER | |
| PATCH | `/products/:id/deactivate` | ADMIN | Soft delete only |
| GET/POST | `/suppliers` | R: all · W: ADMIN, ACHATS | |
| GET | `/stock` | all | Levels; `?categoryId=&state=` |
| GET | `/stock/product/:id` | all | Current level + movement history |
| GET | `/stock/movements` | all | Paginated ledger; the "journal de stock" |
| POST | `/stock/adjust` | ADMIN, MAGASINIER | Inventory correction, reason required (BR-6) |
| GET | `/stock/reconcile` | ADMIN | Ledger vs. levels drift report |
| GET/POST | `/receipts` | R: all · W: ADMIN, MAGASINIER | Bons d'entrée |
| POST | `/receipts/:id/validate` | ADMIN, MAGASINIER | Triggers IN movements |
| POST | `/receipts/:id/cancel` | ADMIN | Compensating movements |
| GET/POST | `/issues` | R: all · W: ADMIN, MAGASINIER | Bons de sortie |
| POST | `/issues/:id/validate` | ADMIN, MAGASINIER | Stock check (BR-2) |
| POST | `/issues/:id/cancel` | ADMIN | |
| GET | `/alerts` | all | `?status=OPEN&type=MIN_THRESHOLD` |
| POST | `/alerts/:id/acknowledge` | ADMIN, ACHATS | |
| GET/POST | `/alerts/sweep` | cron secret | Daily backstop, no user session |
| GET | `/reports/trending` | all | High-rotation products, `?from=&to=&limit=` |
| GET | `/reports/dormant` | all | No movement over period |
| GET | `/reports/movements-summary` | all | Grouped by day or category |
| GET | `/reports/valuation` | ADMIN, DIRECTION | Stock value at buy price |
| GET | `/reports/dashboard` | all | KPI payload, single round trip |
| GET | `/users` | ADMIN | Reports `pending` for accounts not yet activated |
| POST | `/users` | ADMIN | **Invites** - creates without a password, emails a link (BR-11) |
| POST | `/users/:id/activation-code` | ADMIN | Mints a fresh code and returns it on screen |
| POST | `/users/:id/password-reset-link` | ADMIN | One-time link for a locked-out colleague |
| PATCH | `/users/:id` | ADMIN | Name, email, role, status, locale. **Not** the password |
| GET | `/audit-logs` | ADMIN | Paginated, filterable |

**Error envelope (uniform, locale-agnostic):**
```json
{ "error": { "code": "INSUFFICIENT_STOCK", "details": { "productId": "…", "available": 3, "requested": 10 } } }
```

**Trending query** (§4.6) - the core analytics, one indexed query:
```sql
SELECT p.id, p.reference, p.designation,
       SUM(m.quantity)                              AS total_out,
       COUNT(*)                                     AS movement_count,
       SUM(m.quantity)::float / NULLIF($days, 0)    AS avg_daily_out
FROM stock_movements m
JOIN products p ON p.id = m."productId"
WHERE m.type = 'OUT' AND m."createdAt" BETWEEN $from AND $to
GROUP BY p.id
ORDER BY total_out DESC
LIMIT $limit;
```

---

## 9. Screen Inventory

Grouped by role. Tablet-first layouts for everything a magasinier touches (§5 Ergonomie).

| # | Screen | Primary role | Notes |
|---|---|---|---|
| 1 | Login | all | Link to "mot de passe oublié" |
| 1b | Set password | public | Lands from an emailed link - invitation *and* reset (BR-11) |
| 1c | Forgot password | public | Non-committal confirmation, never reveals an address |
| 1d | First-run setup | public once | Creates the very first administrator on an empty database |
| 2 | Dashboard | all (role-shaped) | KPI cards, low-stock list, trend chart, recent movements |
| 3 | Products list | all | Search, filters, stock badge, quick-view |
| 4 | Product form | ADMIN/MAGASINIER | Thresholds, suppliers, barcode |
| 5 | Product detail | all | Stock + movement journal + mini trend chart |
| 6 | Categories (tree) | ADMIN | Drag-free nested list, parent/child |
| 7 | Suppliers | ADMIN/ACHATS | |
| ~~8~~ | ~~Warehouses~~ | - | Withdrawn (Phase 9) - one site |
| 9 | Goods receipts list | MAGASINIER | Status filter chips |
| 10 | Goods receipt form | MAGASINIER | Multi-line, running total, save draft → validate |
| 11 | Goods issues list | MAGASINIER | |
| 12 | Goods issue form | MAGASINIER | **Live availability check per line before validate** |
| ~~13~~ | ~~Transfer form~~ | - | Withdrawn (Phase 9) - BR-7 has no object |
| 14 | Stock adjustment / inventory | ADMIN/MAGASINIER | Counted vs. theoretical, delta, mandatory reason |
| 15 | Stock overview | all | One row per product, exportable |
| 16 | Movement journal | all | Full ledger, filters, export |
| 17 | Alerts | ACHATS/ADMIN | Consolidated, sortable, exportable (§4.5) |
| 18 | Reports & trends | ACHATS/DIRECTION | Period selector, trending/dormant tabs, charts, Excel+PDF export |
| 19 | Users | ADMIN | Invite, resend invitation, `pending` state |
| 20 | Audit log | ADMIN | |
| ~~21~~ | ~~Settings~~ | - | Not built: every parameter it would hold is edited on its own screen |

**Shared components to build once:** `DataTable` (sort/paginate/export), `Modal`,
`ConfirmDialog`, `StatCard`, `StatusBadge`, `ProductPicker` (searchable async select),
`DateRangePicker`, `EmptyState`, `PermissionGate`.

---

## 10. Step-by-Step Build Phases

Eight sprints. Each ends with something demonstrable. **Do not start a sprint before the
previous one's exit criteria pass.**

---

### Phase 0 - Foundations (2-3 days)

- [ ] `git init` at `Siprocom/`; add `.gitignore` (node_modules, .env, dist, .vercel)
- [ ] Create Neon project → copy `DATABASE_URL` (pooled + direct URLs)
- [ ] `server/`: `npm init`, install Express 5, Prisma 6, zod, bcryptjs, jsonwebtoken,
      cookie-parser, cors, dotenv, pino; dev: nodemon
- [ ] `client/`: `npm create vite@latest . -- --template react`, install Tailwind 4,
      react-router-dom 7, axios, @tanstack/react-query, i18next stack, recharts,
      react-hook-form, zod, react-hot-toast, react-icons
- [ ] `.env.example` in both packages (never commit real `.env`)
- [ ] ESLint + Prettier shared config
- [ ] Write `CLAUDE.md`: conventions, layering rule, i18n rule, "read IMPLEMENTATION_PLAN.md first"
- [ ] Health check: `GET /api/health` returns `{ ok: true, db: true }`

**Exit:** `npm run dev` starts both; health check green against Neon.

---

### Phase 1 - Data model & auth (4-5 days)

- [ ] Full `schema.prisma` per §5
- [ ] `npx prisma migrate dev --name init`
- [ ] `prisma/seed.js`: 1 admin, 1 user per role, 3 warehouses, ~8 categories,
      ~40 products with realistic thresholds, 5 suppliers, **90 days of back-dated
      movements** (essential - trend features are untestable without history)
- [ ] `lib/prisma.js` singleton (serverless-safe: reuse `globalThis` instance)
- [ ] Auth: login/logout/me, bcrypt (cost 10), JWT 8 h in httpOnly+SameSite=Strict cookie
- [ ] `middleware/authenticate.js`, `middleware/authorize(...roles)`
- [ ] `middleware/errorHandler.js` emitting the uniform error envelope
- [ ] `middleware/auditLog.js` recording sensitive actions (§4.7)
- [ ] `express-rate-limit` on `/auth/login` (5 attempts / 15 min)

**Exit:** login as each of the 4 roles via curl; a MAGASINIER token gets 403 on `/users`.

---

### Phase 2 - Reference data CRUD + client shell (5-6 days)

**Server**
- [ ] Categories (tree), Products, Suppliers, Warehouses routers + zod validators
- [ ] Pagination/filter/sort helper shared by all list endpoints
- [ ] Soft-delete (`isActive`) - never hard-delete referenced records

**Client**
- [ ] i18n bootstrap + `common` namespace + `LanguageSwitcher` **(do this before any screen)**
- [ ] Axios instance with credentials + 401 → redirect interceptor
- [ ] React Query provider, sensible `staleTime`
- [ ] `AppLayout`: sidebar (role-filtered), topbar (user menu, language), toaster
- [ ] `ProtectedRoute` + `PermissionGate`
- [ ] `DataTable` shared component
- [ ] Screens 1, 3, 4, 6, 7, 8

**Exit:** log in, switch FR↔EN with zero untranslated strings visible, full CRUD on
products/categories/suppliers/warehouses.

---

### Phase 3 - The stock engine (5-6 days) ⚠️ highest-risk sprint

- [ ] `services/stock.service.js`:
      - `applyMovement(tx, { type, productId, warehouseId, quantity, … })`
      - conditional decrement per BR-2, `InsufficientStockError`
      - `StockLevel` upsert, `balanceAfter` snapshot, ledger write
      - all callers wrapped in `prisma.$transaction`
- [ ] `services/counter.service.js` for gapless document numbers (BR-10)
- [ ] Receipts: create draft, edit lines, **validate**, cancel
- [ ] Issues: create draft, edit lines, availability preview, **validate**, cancel
- [ ] Transfers (BR-7)
- [ ] Adjustments (BR-6)
- [ ] `GET /stock`, `/stock/product/:id`, `/stock/movements`
- [ ] `GET /stock/reconcile`
- [ ] **Concurrency test:** fire 20 parallel issues for the last 10 units - exactly 10 must
      succeed, stock lands on 0, never negative

**Exit:** the concurrency test passes and `reconcile` reports zero drift after a scripted
run of 500 random movements.

---

### Phase 4 - Stock UI (5-6 days)

- [ ] Screens 9-16
- [ ] Goods issue form with per-line live availability (green/amber/red)
- [ ] Receipt/issue print view (A4, PDF export)
- [ ] Movement journal with filters + Excel export
- [ ] Inventory adjustment screen: counted vs. theoretical, delta highlighted
- [ ] Optimistic UI on validate, with rollback on error
- [ ] Tablet pass: touch targets ≥ 44 px, no hover-only affordances

**Exit:** a magasinier can complete receipt → issue → transfer → inventory count entirely on
a tablet, in either language.

---

### Phase 5 - Alerts (3-4 days)

- [ ] `services/alert.service.js`: `checkThresholds()` after every committed movement (BR-8)
- [ ] Open/auto-resolve logic, no duplicate OPEN alerts
- [ ] `GET /alerts`, acknowledge endpoint
- [x] Daily sweep endpoint `GET/POST /api/alerts/sweep` (secret-protected) + Vercel Cron
- [x] Screen 17 + alert bell badge in topbar
- [ ] **NOT BUILT - Email digest via Resend, localised per recipient `locale`**
- [ ] **NOT BUILT - Settings: alert recipients, email on/off**

> **Correction (2026-08-17).** This phase was recorded as complete, but the two items
> above were never implemented: `alert.service.js` sends no email, and there is no
> settings screen. Alerting works entirely in-app - the dashboard list, the Alerts
> screen and the topbar badge, refreshed by the daily sweep. The mailer added in
> Phase 9 serves account invitations only.
>
> Whether SIPROCOM wants an email digest at all is an open decision (Q8), not an
> oversight to rush: an alert that is already visible on the screen the magasinier
> works in may not need a mail as well.

**Exit (as actually achieved):** dropping a product below `minThreshold` opens an alert
within the same request and shows in the UI without manual action (§10 criterion 3).
The email half of criterion 3 is not met.

---

### Phase 6 - Analytics, reporting & exports (5-6 days)

- [ ] `services/analytics.service.js`: trending, dormant, movement summaries, valuation
- [ ] Dashboard endpoint - one call, role-shaped payload
- [ ] Screen 2: KPI cards, 30-day movement curve, top-10 trending bar chart, alert list
- [ ] Screen 18: period selector (week/month/quarter/custom), trending & dormant tabs
- [ ] Excel export (SheetJS) - headers translated, numbers as real numbers not strings
- [ ] PDF export (pdfmake) - header/footer, logo, generation date, active language
- [ ] Verify export fidelity: no truncation, no lost decimals (§10 criterion 6)

**Exit:** dashboard loads < 2 s on seeded data; trending ranking matches a hand-computed
control query.

---

### Phase 7 - Hardening & recette (4-5 days)

- [ ] Users admin screen + password reset flow
- [ ] Audit log screen with filters
- [ ] Settings screen
- [ ] Full i18n audit: script scanning for missing/extra keys between `fr` and `en`
- [ ] Security pass: helmet, CORS allowlist, cookie flags, zod on every body,
      no secrets in client bundle, `npm audit`
- [ ] Performance pass: verify indexes are used (`EXPLAIN ANALYZE` on list + trend queries),
      add pagination anywhere returning > 100 rows
- [ ] Accessibility pass: labels, focus order, contrast
- [ ] Error boundaries + friendly empty/loading/error states everywhere
- [ ] Test plan document + recette report (spec deliverable, phase 4)

**Exit:** every acceptance criterion in §13 is checked green with evidence.

---

### Phase 8 - Deployment, migration & training (4-5 days)

- [ ] Neon production DB (separate from dev), migrations applied
- [ ] Deploy API + client to Vercel, custom domain, HTTPS
- [ ] Environment variables set in Vercel (never in code)
- [ ] Vercel Cron for the alert sweep
- [ ] **Data migration:** Excel/CSV importer for existing products + opening stock.
      Opening balances enter as `ADJUSTMENT` movements with reason "Stock initial" so the
      ledger stays complete from day one (§8 "reprise des données")
- [ ] Backup verification: restore a Neon snapshot into a scratch DB and prove it works
- [ ] Bilingual user guide (magasinier / achats / direction sections)
- [ ] Training sessions per §8
- [ ] Post-go-live: 2-week hypercare window

**Exit:** production live, real users trained, opening stock loaded and reconciled.

---

## 11. Testing Strategy

Keep it proportionate - deep on the stock engine, light elsewhere.

| Layer | Tool | Coverage target |
|---|---|---|
| Unit - services | **Vitest** | 100 % of `stock.service`, `alert.service`, `analytics.service` |
| Integration - API | **Vitest + supertest** against a test Postgres (Neon branch or Docker) | Every route: happy path + auth failure + validation failure |
| Concurrency | Custom script, `Promise.all` bursts | BR-2 and BR-10 must hold under parallel load |
| E2E | **Playwright** | 5 critical journeys: login · receipt→validate · issue→validate · alert triggered · report export. **Run each in both FR and EN.** |
| Manual recette | Test plan doc | Phase 4 deliverable of the cahier des charges |

**Non-negotiable test list** (write these before the features are called done):
1. Issue exceeding stock → 409, stock unchanged
2. 20 parallel issues for 10 units → exactly 10 succeed
3. Cancelling a validated receipt reverses stock exactly
4. ~~Transfer conserves total quantity across warehouses~~ - withdrawn with BR-7
5. Adjustment without reason → 422
6. Crossing `minThreshold` opens exactly one alert; returning above resolves it
7. Trending ranking matches a control SQL aggregation
8. MAGASINIER token → 403 on `/users` and `/reports/valuation`
9. Movement always records `userId` + timestamp
10. Every UI string resolves (automated key check, `client/scripts/check-translations.js`)
11. An invitation link works once, then reports `INVALID_TOKEN`; an account with no
    password cannot log in and is indistinguishable from a missing one (BR-11)

Tests 1-3, 5, 9 and the concurrency and numbering cases run as one script against the
dev database: `npm run test:stock` (16 checks). The UI-render suite is
`npm test` in `client/`.

---

## 12. Deployment

### 12.1 Cloud (recommended for v1)

```
Vercel (client, static/CDN)  →  Vercel (server, serverless)  →  Neon Postgres
```
- Two Vercel projects from one repo (root dirs `client/` and `server/`)
- `server/vercel.json`: route everything to `index.js` via `@vercel/node`
- **Use Neon's pooled connection string** for the serverless API (connection limits)
- Prisma: `binaryTargets = ["native", "rhel-openssl-3.0.x"]`, `postinstall: prisma generate`
- Run migrations with `prisma migrate deploy` in CI - **not** `db push` in production
- Env vars: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CLIENT_URL`, `RESEND_API_KEY`, `CRON_SECRET`

### 12.2 On-premise (if SIPROCOM chooses an internal server)

```yaml
# docker-compose.yml - postgres:16 + api + nginx(client build)
# volumes: pgdata; nightly pg_dump to /backups, retained 30 days
```
- Nginx reverse proxy + Let's Encrypt (or internal CA for LAN-only)
- `pg_dump` cron + **documented, tested restore procedure** (§5 Sauvegarde)
- Same codebase; only `DATABASE_URL` and the deploy pipeline differ

### 12.3 Environments

| Env | DB | Purpose |
|---|---|---|
| local | Neon branch or Docker Postgres | Development, seeded |
| staging | Neon branch | Recette / client validation |
| production | Neon main | Live |

---

## 13. Acceptance Criteria Traceability

Direct mapping of §10 of the cahier des charges to implementation and proof.

| # | Criterion (spec §10) | Implemented by | Verified by |
|---|---|---|---|
| 1 | Entries/exits reflected immediately in stock level | `stock.service.applyMovement` in-transaction `StockLevel` update; React Query invalidation | Integration test + E2E |
| 2 | No exit may make stock negative, except explicit authorised profile | BR-2 conditional decrement; BR-3 ADMIN override + audit | Concurrency test #2, permission test |
| 3 | Min/max alerts generated automatically, no manual action | BR-8 post-commit `checkThresholds` + daily cron sweep | Test #6 |
| 4 | Trend dashboard correctly identifies most-moved products over a period | `analytics.service.getTrending` indexed aggregation | Test #7 vs. control query |
| 5 | Every movement traced with user, date and time | Required `userId` + `createdAt`, immutable ledger (BR-4/5) | Test #9, audit log screen |
| 6 | Reports exportable to Excel and PDF without data loss | SheetJS + pdfmake, translated headers, numeric types preserved | Manual recette + E2E export check |

---

## 14. Risks & Decisions Pending

**Open questions for SIPROCOM** (raise in the Phase 0 kickoff - several block later phases):

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Cloud hosting or internal server? (§8) | Phase 8 | **Dev runs on local PostgreSQL 17** (already installed on the dev machine); Neon/Docker decision still open for production |
| ~~Q2~~ | ~~How many warehouses at go-live?~~ | - | **Resolved 2026-08-17: one.** The dimension is removed entirely (Phase 9) |
| Q3 | Currency and decimal precision? | Phase 2 formatting | XOF, 0 decimals - **confirm** |
| Q4 | Lot/batch tracking needed, or informational only? | Phase 3 scope | Field captured, not enforced FEFO in v1 |
| Q5 | Expiry-date management (perishables)? | Possible Phase 3 extension | Out of v1 scope |
| Q6 | Barcode scanning at go-live? | Phase 4 | Field exists; camera scan is Phase 2 of the product |
| Q7 | Format and volume of existing data to migrate? | Phase 8 | Assume Excel; importer built in Phase 8 |
| Q8 | Alert email recipients and frequency? | Phase 5 | Per-role, daily digest, configurable |
| Q9 | Stock valuation method (WAC / FIFO)? | Phase 6 valuation report | Weighted average cost |
| Q10 | Concurrent user count and peak hours? | Phase 7 perf targets | Assume < 20 concurrent |

**Technical risks and mitigations:**

| Risk | Impact | Mitigation |
|---|---|---|
| Race conditions on stock | Corrupt inventory - the worst failure mode here | BR-2 atomic conditional update; concurrency test in CI; `reconcile` endpoint |
| Serverless cold starts breach the 2 s NFR | Poor field UX | Prisma singleton, pooled connections, lean payloads; ping-warm cron if needed |
| Ledger/level drift | Loss of trust in the system | `balanceAfter` snapshots + scheduled reconcile with alerting |
| Scope creep toward invoicing/e-commerce | Timeline slip | §2.2 exclusions are explicit - point at them |
| Translation drift between FR and EN | Broken bilingual promise | Automated key-diff check in CI |
| Neon free-tier limits | Service interruption | Monitor storage/compute; €19/mo upgrade path is trivial |
| Data migration errors at go-live | Wrong opening stock | Dry-run import into staging, reconcile against a physical count before cutover |

---

## 15. Glossary FR ↔ EN

Use these exact English terms in code; use the French in the FR UI.

| Français | English (code) | Entity/field |
|---|---|---|
| Produit | Product | `Product` |
| Référence | Reference | `product.reference` |
| Désignation | Designation | `product.designation` |
| Catégorie | Category | `Category` |
| Fournisseur | Supplier | `Supplier` |
| Bon d'entrée | Goods Receipt | `GoodsReceipt` |
| Bon de sortie | Goods Issue | `GoodsIssue` |
| Mouvement de stock | Stock Movement | `StockMovement` |
| Niveau de stock | Stock Level | `StockLevel` |
| Seuil minimum | Minimum threshold | `product.minThreshold` |
| Seuil maximum | Maximum threshold | `product.maxThreshold` |
| Rupture de stock | Stock-out | alert `MIN_THRESHOLD` |
| Surstock | Overstock | alert `MAX_THRESHOLD` |
| Réapprovisionnement | Replenishment | - |
| Inventaire | Stock count / Inventory | adjustment flow |
| Ajustement | Adjustment | `MovementType.ADJUSTMENT` |
| Invitation | Invitation | `AccountToken` type `INVITATION` |
| Réinitialisation de mot de passe | Password reset | `AccountToken` type `PASSWORD_RESET` |
| Destinataire | Recipient | `goodsIssue.recipient` |
| Motif | Reason | `movement.reason` |
| Produit tendance | Trending product | `/reports/trending` |
| Stock dormant | Dormant stock | `/reports/dormant` |
| Rotation | Turnover / rotation | analytics |
| Magasinier | Storekeeper | `Role.MAGASINIER` |
| Responsable achats | Purchasing manager | `Role.ACHATS` |
| Direction | Management | `Role.DIRECTION` |
| Journal de stock | Stock ledger | `/stock/movements` |
| Traçabilité | Traceability | `AuditLog` |
| Casse | Damage | `IssueReason.DAMAGE` |
| Échantillon | Sample | `IssueReason.SAMPLE` |
| Numéro de lot | Lot number | `movement.lotNumber` |

---

## Progress Tracker

| Phase | Status | Started | Completed |
|---|---|---|---|
| 0 - Foundations | ✅ Complete | 2026-08-08 | 2026-08-08 |
| 1 - Data model & auth | ✅ Complete | 2026-08-08 | 2026-08-08 |
| 2 - Reference data + shell | ✅ Complete | 2026-08-08 | 2026-08-08 |
| 3 - Stock engine | ✅ Complete - 16/16 engine tests pass, `npm run test:stock` | 2026-08-08 | 2026-08-08 |
| 4 - Stock UI | ✅ Complete | 2026-08-09 | 2026-08-09 |
| 5 - Alerts | ⚠️ Partial - in-app alerting works; email digest and settings screen were never built (see the correction in §10 Phase 5) | 2026-08-09 | 2026-08-09 |
| 6 - Analytics & exports | ✅ Complete | 2026-08-09 | 2026-08-09 |
| 7 - Hardening & recette | ✅ Complete - permission matrix verified across all 4 roles | 2026-08-09 | 2026-08-09 |
| 8 - Deployment & training | ✅ Complete - Docker, CSV import (tested), README + bilingual user guide | 2026-08-09 | 2026-08-09 |
| 9 - Single-site simplification | ✅ Complete - 16/16 engine tests, 13/13 UI render tests | 2026-08-17 | 2026-08-17 |

---

## Phase 9 - Single-site simplification (2026-08-17)

Scope decision by SIPROCOM: this application serves SIPROCOM alone, on one site.
A multi-tenant SaaS layer had been prepared and was discarded before it was ever
committed; the database was reset, so no data was migrated or lost.

**Warehouses removed entirely.** `1717a85` had already taken them out of the interface
while keeping `warehouseId` in the database, on the reasoning that it keyed the stock
engine and the append-only ledger. That reasoning depended on there being history to
protect; the reset left none, so the column went too.

- `stock_levels` holds one row per product, keyed by a unique `productId` - which is
  what the BR-2 conditional decrement relies on, exactly as the composite key did. The
  guard is unchanged in nature: one predicate fewer in the same `WHERE`.
- `StockLevel` stays its own table rather than folding into `Product.quantity`: that
  counter moves on every sale and would otherwise lock the catalogue row being edited.
- Transfers, BR-7, `IssueReason.TRANSFER` and `EntryReason.TRANSFER_IN` are gone.
- The `Warehouse` table is dropped outright, not kept as a hidden single row - nothing
  read its name or address any more.

**Accounts are invited, not provisioned with a password** (BR-11). See the commit
`2c218bc` and §8 for the endpoints. `RESEND_API_KEY` is now **required in production**:
without it an invitation goes to the server log, which is useless to a real colleague.

**Signup screen (added 2026-08-22).** A two-step `/signup` completes an invitation:
the invited person types their own name and password, then confirms a six-digit
code. It is invitation-gated by decision - open registration was considered and
refused, because anyone reaching the URL would otherwise see the stock, the
purchase prices and the margins. The code is capped at five attempts and expires
in ten minutes; six digits is only a million combinations, so the cap, not the
code, is what makes it safe.

**Known gaps, deliberate:**
- No alert email digest (Q8 still open - see the Phase 5 correction).
- No settings screen.
- No open registration: an ADMIN invites and chooses the role; the invited person
  then completes their own account at `/signup`.

---

*Plan version 1.1 - derived from Cahier des charges SIPROCOM SGS v1.0 (07/08/2026),
amended 2026-08-17 for the single-site scope.*
*Update this document whenever a decision in §14 is resolved or scope changes.*
