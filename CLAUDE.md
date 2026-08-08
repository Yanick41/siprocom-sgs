# SIPROCOM SGS — Development Conventions

## Read first

**[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is the source of truth** for this
project: stack, data model, business rules, API surface, phases, and acceptance criteria.
Consult it before starting any task, and update its Progress Tracker when a phase closes.

Requirement source: `Cahier_des_charges_SIPROCOM_SGS.pdf` v1.0.

## Project shape

- `client/` — React 19 + Vite 8 + Tailwind 4 SPA
- `server/` — Express 5 + Prisma 6 + PostgreSQL REST API

## Hard rules

1. **No hardcoded user-facing strings.** Every label goes through `t()`. A change is not
   done until both `client/src/i18n/locales/fr/*` and `.../en/*` are updated. Default
   language is French.
2. **Stock mutations live only in `server/src/services/stock.service.js`.** No route,
   controller, or other service writes to `stock_levels` or `stock_movements` directly.
3. **Never read-then-write stock.** Use the conditional atomic decrement inside
   `prisma.$transaction` (see IMPLEMENTATION_PLAN.md §6, BR-2).
4. **`stock_movements` is append-only.** No UPDATE, no DELETE. Corrections are new
   compensating movements.
5. **Every movement records `userId` and `createdAt`.** No anonymous movements.
6. **API errors return codes, not sentences** — `{ error: { code, details } }`. The client
   maps codes to `errors:*` translation keys.
7. **Validate every request body with zod** before it reaches a service.
8. **Soft-delete only** (`isActive`) for referenced records.
9. **Money uses `Decimal`**, never `Float`. Formatting via `Intl.NumberFormat`.
10. **Dates and numbers are formatted with `Intl.*`** using the active locale — never
    manual string building.

## Layering

`routes` (parse + authorize) → `services` (business logic, owns transactions) → `prisma`.

## Roles

`ADMIN` · `MAGASINIER` · `ACHATS` · `DIRECTION` — see the API table in the plan for the
per-endpoint matrix.

## Commands

```bash
# server
npm run dev              # nodemon
npx prisma migrate dev   # local migration
npx prisma db seed
npx prisma studio

# client
npm run dev
npm run build
```

## Before calling a feature done

- Both locales updated
- zod validation on any new endpoint
- Business rules in §6 respected; tests from §11 added where applicable
- Loading / empty / error states present in the UI
- Touch targets ≥ 44 px on magasinier-facing screens
