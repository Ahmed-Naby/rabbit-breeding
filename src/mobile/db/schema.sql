-- Local SQLite mirror for offline sync (Capacitor app only — the web app
-- never touches this file, it talks to Postgres directly via Prisma).
--
-- Columns mirror the Postgres/Prisma models 1:1 for the tables the offline
-- boards read (see prisma/schema.prisma), so a pulled row can be stored with
-- no field mapping. Dates are stored as ISO 8601 TEXT (SQLite has no native
-- datetime type); booleans as INTEGER 0/1. `updatedAt` on every mirrored
-- table is the server's value, copied verbatim from pull — it is what the
-- next pull's `since` cursor is compared against server-side, so it must
-- never be touched by a local/optimistic write.

CREATE TABLE IF NOT EXISTS rabbit (
  id             TEXT PRIMARY KEY,
  tagId          TEXT,
  retiredTagId   TEXT,
  breed          TEXT,
  color          TEXT,
  sex            TEXT NOT NULL DEFAULT 'unknown',
  dateOfBirth    TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  doeState       TEXT NOT NULL DEFAULT 'empty',
  cage           TEXT,
  origin         TEXT,
  movedToHerdPen INTEGER NOT NULL DEFAULT 0,
  acquiredDate   TEXT,
  acquiredFrom   TEXT,
  notes          TEXT,
  photoUrl       TEXT,
  sireId         TEXT,
  damId          TEXT,
  litterId       TEXT,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rabbit_status ON rabbit(status);
CREATE INDEX IF NOT EXISTS idx_rabbit_sex ON rabbit(sex);
CREATE INDEX IF NOT EXISTS idx_rabbit_doeState ON rabbit(doeState);

CREATE TABLE IF NOT EXISTS breeding (
  id                   TEXT PRIMARY KEY,
  buckId               TEXT,
  doeId                TEXT NOT NULL,
  matingDate           TEXT,
  expectedKindlingDate TEXT NOT NULL,
  actualKindlingDate   TEXT,
  nestBoxDate          TEXT,
  palpationConfirmedDate TEXT,
  outcome              TEXT NOT NULL DEFAULT 'pending',
  pregnancyTestResult  TEXT NOT NULL DEFAULT 'pending',
  notes                TEXT,
  createdAt            TEXT NOT NULL,
  updatedAt            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_breeding_doeId ON breeding(doeId);
CREATE INDEX IF NOT EXISTS idx_breeding_buckId ON breeding(buckId);
CREATE INDEX IF NOT EXISTS idx_breeding_outcome ON breeding(outcome);

CREATE TABLE IF NOT EXISTS litter (
  id                 TEXT PRIMARY KEY,
  breedingId         TEXT NOT NULL UNIQUE,
  kindlingDate       TEXT NOT NULL,
  bornAlive          INTEGER NOT NULL DEFAULT 0,
  bornDead           INTEGER NOT NULL DEFAULT 0,
  weaned             INTEGER,
  weaningDate        TEXT,
  weaningWeightGrams INTEGER,
  notes              TEXT,
  createdAt          TEXT NOT NULL,
  updatedAt          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_litter_breedingId ON litter(breedingId);

CREATE TABLE IF NOT EXISTS weight_record (
  id          TEXT PRIMARY KEY,
  rabbitId    TEXT NOT NULL,
  date        TEXT NOT NULL,
  weightGrams INTEGER NOT NULL,
  notes       TEXT,
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weight_record_rabbitId ON weight_record(rabbitId, date);

-- Single-row cache of the server's Settings, refreshed on every pull.
CREATE TABLE IF NOT EXISTS settings_cache (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),
  weightUnit               TEXT NOT NULL DEFAULT 'kg',
  gestationDays             INTEGER NOT NULL DEFAULT 30,
  gestationWindowDays       INTEGER NOT NULL DEFAULT 3,
  pregnancyTestDays         INTEGER NOT NULL DEFAULT 10,
  palpationCheckDays        INTEGER NOT NULL DEFAULT 15,
  weaningDays               INTEGER NOT NULL DEFAULT 28,
  nestBoxDays               INTEGER NOT NULL DEFAULT 27,
  matingWeightGrams         INTEGER NOT NULL DEFAULT 3000,
  rebreedAfterKindlingDays  INTEGER NOT NULL DEFAULT 0,
  currency                  TEXT NOT NULL DEFAULT 'EGP'
);

-- Single-row sync bookkeeping: this device's identity and its pull cursor.
-- `since` is always the server's own `serverTime` from the last successful
-- pull/bootstrap response — never the device's clock (see /api/sync/pull).
-- `lastResetAt` is Settings.dataResetAt as last observed from the server;
-- compared on every pull to detect a server-side "wipe/restore online
-- database" and trigger a local wipe + re-bootstrap instead of a normal
-- incremental pull (see pull()).
--
-- NOTE: never put an inline `--` comment inside a table's column-list
-- parentheses in this file. The web-platform backup/restore path
-- (jeep-sqlite) parses each table's column list with a naive comma split
-- and no comment awareness — an embedded comment gets glued onto a
-- neighboring column definition, either dropping that column silently or
-- (if it lands on the last column) leaving a dangling comma before the
-- closing paren, which SQLite rejects with "near ')': syntax error" on
-- restore. Put type/enum notes on their own line above the table instead.
CREATE TABLE IF NOT EXISTS sync_cursor (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  deviceId       TEXT NOT NULL,
  since          TEXT,
  lastSyncAt     TEXT,
  lastResetAt    TEXT,
  -- Last MIRROR_REFRESH_VERSION (sync-manager.ts) this mirror was rebuilt
  -- at; NULL on mirrors provisioned before the mechanism existed.
  mirrorRefreshV INTEGER
);

-- Outbox of queued business operations, one row per clientOpId. `status`
-- moves pending -> syncing -> (applied | already_applied | rejected). A
-- rejected op is never auto-retried — it stays visible until a human
-- resolves or discards it (see sync-manager.ts / the Phase 5 review screen).
-- `payload` is JSON. `status` is one of: pending | syncing | applied |
-- already_applied | rejected.
CREATE TABLE IF NOT EXISTS outbox (
  clientOpId    TEXT PRIMARY KEY,
  opType        TEXT NOT NULL,
  payload       TEXT NOT NULL,
  clientAt      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  resultMessage TEXT,
  createdAt     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);

CREATE TABLE IF NOT EXISTS foster_log (
  id        TEXT PRIMARY KEY,
  fromDoeId TEXT NOT NULL,
  toDoeId   TEXT NOT NULL,
  count     INTEGER NOT NULL,
  date      TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_foster_log_fromDoeId ON foster_log(fromDoeId);
CREATE INDEX IF NOT EXISTS idx_foster_log_toDoeId ON foster_log(toDoeId);

-- `type` is one of: 'sale' | 'death' | 'retained'
CREATE TABLE IF NOT EXISTS kit_stock_movement (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL,
  type            TEXT NOT NULL,
  count           INTEGER NOT NULL,
  weightGrams     INTEGER,
  pricePerKgCents INTEGER,
  amountCents     INTEGER,
  transactionId   TEXT,
  rabbitId        TEXT,
  notes           TEXT,
  createdAt       TEXT NOT NULL,
  updatedAt       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_stock_movement_date ON kit_stock_movement(date);

-- `type` is one of: 'vaccination' | 'treatment' | 'illness' | 'checkup'
CREATE TABLE IF NOT EXISTS health_record (
  id          TEXT PRIMARY KEY,
  rabbitId    TEXT NOT NULL,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  nextDueDate TEXT,
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_record_rabbitId ON health_record(rabbitId);

-- `type` is one of: 'income' | 'expense'
-- `category` is one of: 'sale' | 'purchase' | 'feed' | 'vet' | 'equipment' | 'other'
-- Devices provisioned before the FeedLog model was removed still carry a
-- vestigial nullable feedLogId column here — harmless, never referenced.
CREATE TABLE IF NOT EXISTS transaction_ledger (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  type          TEXT NOT NULL,
  category      TEXT NOT NULL,
  amountCents   INTEGER NOT NULL,
  notes         TEXT,
  rabbitId      TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transaction_ledger_date ON transaction_ledger(date);

CREATE TABLE IF NOT EXISTS breed (
  id        TEXT PRIMARY KEY,
  name      TEXT UNIQUE NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pregnancy_test_log (
  id         TEXT PRIMARY KEY,
  doeId      TEXT NOT NULL,
  buckId     TEXT,
  matingDate TEXT NOT NULL,
  testDate   TEXT NOT NULL,
  result     TEXT NOT NULL,
  createdAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pregnancy_test_log_doeId ON pregnancy_test_log(doeId);

CREATE TABLE IF NOT EXISTS resorption_log (
  id             TEXT PRIMARY KEY,
  doeId          TEXT NOT NULL,
  buckId         TEXT,
  matingDate     TEXT NOT NULL,
  resorptionDate TEXT NOT NULL,
  createdAt      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resorption_log_doeId ON resorption_log(doeId);

CREATE TABLE IF NOT EXISTS kindling_log (
  id           TEXT PRIMARY KEY,
  doeId        TEXT NOT NULL,
  buckId       TEXT,
  matingDate   TEXT,
  kindlingDate TEXT NOT NULL,
  createdAt    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kindling_log_doeId ON kindling_log(doeId);

-- Permanent mating-event archive, read-only on mobile (populated purely via
-- sync pull, like pregnancy_test_log/kindling_log above) — never written by
-- local-ops.ts, since there is no optimistic local flow for it.
CREATE TABLE IF NOT EXISTS mating_log (
  id                 TEXT PRIMARY KEY,
  doeId              TEXT NOT NULL,
  buckId             TEXT,
  matingDate         TEXT NOT NULL,
  wasNursingAtMating INTEGER NOT NULL DEFAULT 0,
  createdAt          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mating_log_doeId ON mating_log(doeId);
