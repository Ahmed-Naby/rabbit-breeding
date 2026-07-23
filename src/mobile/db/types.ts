// Local SQLite row shapes — mirror schema.sql, not the Prisma-generated
// types (those pull in the Prisma client, which can't run in a Capacitor
// WebView). ISO date fields stay as `string | null`, matching what SQLite
// stores and what the sync API sends/receives over JSON.

export type LocalRabbit = {
  id: string;
  tagId: string | null;
  retiredTagId: string | null;
  breed: string | null;
  color: string | null;
  sex: string;
  dateOfBirth: string | null;
  status: string;
  doeState: string;
  cage: string | null;
  origin: string | null;
  movedToHerdPen: 0 | 1;
  acquiredDate: string | null;
  acquiredFrom: string | null;
  notes: string | null;
  photoUrl: string | null;
  sireId: string | null;
  damId: string | null;
  litterId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalBreeding = {
  id: string;
  buckId: string | null;
  doeId: string;
  matingDate: string | null;
  expectedKindlingDate: string;
  actualKindlingDate: string | null;
  nestBoxDate: string | null;
  palpationConfirmedDate: string | null;
  outcome: string;
  pregnancyTestResult: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalLitter = {
  id: string;
  breedingId: string;
  kindlingDate: string;
  bornAlive: number;
  bornDead: number;
  weaned: number | null;
  weaningDate: string | null;
  weaningWeightGrams: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalWeightRecord = {
  id: string;
  rabbitId: string;
  date: string;
  weightGrams: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalSettings = {
  id: 1;
  weightUnit: string;
  gestationDays: number;
  gestationWindowDays: number;
  pregnancyTestDays: number;
  palpationCheckDays: number;
  weaningDays: number;
  nestBoxDays: number;
  matingWeightGrams: number;
  rebreedAfterKindlingDays: number;
  currency: string;
};

export type OutboxStatus = "pending" | "syncing" | "applied" | "already_applied" | "rejected";

export type OutboxRow = {
  clientOpId: string;
  opType: string;
  payload: string; // JSON-encoded
  clientAt: string;
  status: OutboxStatus;
  resultMessage: string | null;
  createdAt: string;
};
