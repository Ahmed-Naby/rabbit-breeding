# RabbitTrack 🐇

A mobile-friendly rabbit breeding farm management app. Track your herd, matings,
litters, weights, health, and finances — built to be used barn-side on a phone.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Prisma 7** ORM with **SQLite** (driver adapter — swap to Postgres later)
- **Tailwind CSS v4** + **shadcn/ui** (Base UI) components
- **Zod** validation · **Recharts** growth charts · **date-fns**

## Getting started

```bash
npm install                # also runs `prisma generate` (postinstall)
npm run db:migrate         # apply migrations (creates dev.db)
npm run db:seed            # load a realistic sample herd
npm run dev                # http://localhost:3000
```

## Key conventions

- **Single-user / single-farm** — no auth. All data is global; a `farmId` column
  can be added later behind a migration.
- **Money is stored as integer cents** (`amountCents`), **weight as integer grams**
  (`weightGrams`). Never floats — no rounding drift. The UI converts for display
  based on `Settings.weightUnit` and `Settings.currency`.
- **"Enum" fields are `String`** (SQLite has no native enums). Allowed values live
  in [`src/lib/enums.ts`](src/lib/enums.ts) and are enforced by Zod. These map 1:1
  to real enums when moving to Postgres.
- **Dates stored in UTC**, displayed in local time via the `<LocalDate>` component
  (hydration-safe).
- **Soft-delete only** for rabbits — status change (`sold`/`culled`/`deceased`/
  `reference`), never a hard delete, to preserve pedigree integrity.
- **Parentage source of truth** is `Rabbit.sireId` / `damId`. Promoting a kit from
  a litter pre-fills these from the litter's breeding, but the FK stays authoritative.

## Features

| Module | Where |
|---|---|
| Dashboard (kindlings, overdue tasks, herd stats, survival trend) | `/` |
| Rabbit roster + filters, detail, pedigree, edit, soft-delete | `/rabbits` |
| Breeding: log matings, auto expected kindling, overdue/upcoming | `/breedings` |
| Litters: record kindling, survival rate, tag kits | `/litters` |
| Weight tracking + growth chart (per rabbit) | rabbit detail → Weight tab |
| Health records + recurring due-date reminders | `/health` + rabbit Health tab |
| Finance: income/expense, P/L by range | `/finance` |
| Settings: units, gestation period, currency | `/settings` |

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run db:migrate` | Create & apply a migration |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Drop, re-migrate, re-seed |

## Swapping SQLite → Postgres later

1. Change the `datasource` provider in [`prisma/schema.prisma`](prisma/schema.prisma)
   to `postgresql`.
2. Replace `@prisma/adapter-better-sqlite3` with `@prisma/adapter-pg` in
   [`src/lib/prisma.ts`](src/lib/prisma.ts) and the seed.
3. Set `DATABASE_URL` to your Postgres connection string.
4. Optionally convert the `String` enum-like columns to native `enum`s.
