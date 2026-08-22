# SIPROCOM SGS — Development Conventions

## Read first

**[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is the source of truth** for this
project: stack, data model, business rules, API surface, phases, and acceptance criteria.
Consult it before starting any task, and update its Progress Tracker when a phase closes.

Requirement source: `Cahier_des_charges_SIPROCOM_SGS.pdf` v1.0.

## Project shape

- `client/` — React 19 + Vite 8 + Tailwind 4 SPA
- `server/` — Express 5 + Prisma 6 + PostgreSQL REST API

## Scope, in one line

A dedicated application for **SIPROCOM alone, on one site**. There is no tenant, no
warehouse and no transfer — stock is "this product". Do not reintroduce any of the three
without an explicit decision recorded in the plan.

## Hard rules

1. **No hardcoded user-facing strings.** Every label goes through `t()`. The UI is French
   only — `client/src/i18n/locales/fr/*`, and `SUPPORTED_LANGUAGES` holds one entry.
   Server-side email templates are the one exception and carry fr/en.
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
11. **Signup is invitation-only.** `/signup` is a public *screen*, not an open door:
    the server issues a code only for an address an ADMIN already invited, and the
    ADMIN fixes the role. Never relax that check — the application holds SIPROCOM's
    purchase prices, margins and suppliers.
12. **Nobody sets another person's password.** An ADMIN invites and hands over a
    one-time code; the invited person chooses their own password (BR-11).
    `user.password` is nullable and null means "not yet activated". `/login`
    **says so plainly** (`ACCOUNT_NOT_ACTIVATED`) and links to `/signup` — it used
    to hide the state behind INVALID_CREDENTIALS to avoid enumeration, which cost
    hours of confusion and bought nothing: there is no public signup, company
    addresses are guessable, and knowing an account is pending grants no access.
    A wrong password on an *activated* account still answers INVALID_CREDENTIALS.
13. **There is no email in this system.** Codes and reset links are returned to the
    ADMIN on screen and passed on by hand. Do not add a mail dependency back without
    an explicit decision: it was removed because a misconfigured provider locked
    people out silently, and one site does not need it.

## Layering

`routes` (parse + authorize) → `services` (business logic, owns transactions) → `prisma`.

## Roles

`ADMIN` · `MAGASINIER` · `ACHATS` · `DIRECTION` — see the API table in the plan for the
per-endpoint matrix.

## Commands

```bash
# server
npm run dev              # nodemon
npm run test:stock       # 16 engine checks — BR-2, BR-10, ledger/level agreement
npm run create-admin -- --email … --name "…" --password "…"
npx prisma migrate deploy   # apply migrations (migrate dev needs a TTY)
npx prisma studio

# client
npm run dev
npm run build
npm test                        # screen-render suite
node scripts/check-translations.js
```

> `prisma migrate dev` and `migrate reset` need an interactive terminal and are refused
> when run by an agent. Write the migration SQL by hand and apply it with
> `migrate deploy`. The seed additionally refuses any non-local database.

## Before calling a feature done

- French locale updated (`check-translations.js` green)
- zod validation on any new endpoint
- Business rules in §6 respected; tests from §11 added where applicable
- Loading / empty / error states present in the UI
- Touch targets ≥ 44 px on magasinier-facing screens
