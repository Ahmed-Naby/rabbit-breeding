/**
 * Generates a year of plausible history for a ~200-doe farm and writes it to a
 * JSON file in the runFullExport()/FullExportData shape (see
 * src/lib/sync/import.ts), so it can be loaded with `npm run demo:load`.
 *
 * The point is to exercise the REPORTS, not to look pretty in the tables: every
 * number the app derives — the five متوسطات الأداء, إنتاجية القطيع, نافق
 * الرعاية, رصيد الفطام, the finance page — has to come out of rows that were
 * produced the same way the real app produces them. So this script simulates
 * the farm event by event (mate → test → nest box → kindle → deaths → wean →
 * sell) and writes the archives as the ops in src/lib/breeding-ops.ts would,
 * rather than sprinkling random rows into each table independently. Two
 * consequences are worth spelling out, because they are the whole reason the
 * report numbers can be trusted afterwards:
 *
 *  - KindlingLog carries BOTH the frozen birth counts (bornAliveAtKindling /
 *    bornDeadAtKindling) and the live ones (bornAlive / bornDead) that kit
 *    deaths and fostering move afterwards. «نافق الرعاية» is the gap between
 *    them, so a generator that set all four equal would report a farm that
 *    never loses a kit.
 *  - Breeding/Litter hold only each doe's CURRENT cycle, because the real app
 *    reuses one Breeding row per doe and overwrites it every mating. All the
 *    history lives in the *Log tables. A generator that wrote one Breeding row
 *    per cycle would look right on the does board and make every report double
 *    count.
 *
 * Deterministic: the same SEED always produces the same farm, so a number that
 * looks wrong can be re-checked against the identical dataset.
 *
 * Usage:  npx tsx scripts/generate-demo-farm.mts [outFile] [--seed=N] [--does=N]
 */
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

/* ───────────────────────────── knobs ───────────────────────────── */

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
const OUT_FILE = args.find((a) => !a.startsWith("--")) ?? "demo-farm.json";
const SEED = flag("seed", 20260727);
const ACTIVE_DOES = flag("does", 200);
const SIM_DAYS = flag("days", 365);

/** The farm's own settings — these drive what the report calls "المستهدف". */
const GESTATION_DAYS = 31;
const REBREED_AFTER_KINDLING_DAYS = 10; // نصف مكثف → 8 دورات في السنة
const WEANING_DAYS = 28;
const PREGNANCY_TEST_DAYS = 10;
const NEST_BOX_DAYS = 27;
const CURRENCY = "EGP";

/** Market assumptions, in the smallest currency unit (piastres). */
const PRICE_PER_KG_CENTS = 5_500; // 55 ج.م/كجم
const KIT_SALE_WEIGHT_G = [1_900, 2_400] as const;
const FEED_COST_PER_DOE_PER_DAY_CENTS = 700; // 7 ج.م — doe + her litter
const FEED_POSTING_INTERVAL_DAYS = 15;
const VET_COST_PER_MONTH_CENTS = 300_000; // 3,000 ج.م

/* ─────────────────────── deterministic RNG ─────────────────────── */

/** mulberry32 — small, fast, and reproducible, which Math.random is not. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(SEED);
/** Inclusive integer in [min, max]. */
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const chance = (p: number) => rng() < p;
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/* ───────────────────────────── dates ───────────────────────────── */

const DAY_MS = 86_400_000;
const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);
const SIM_START = new Date(TODAY.getTime() - SIM_DAYS * DAY_MS);

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const daysAgo = (n: number) => addDays(TODAY, -n);
const iso = (d: Date) => d.toISOString();

/* ───────────────────────────── ids ─────────────────────────────── */

/** cuid2-shaped enough for the app (which never parses ids) and collision-free. */
const id = () => "d" + randomUUID().replace(/-/g, "").slice(0, 23);

/* ───────────────────────────── rows ────────────────────────────── */

type Row = Record<string, unknown>;

const rabbits: Row[] = [];
const breedings: Row[] = [];
const litters: Row[] = [];
const matingLogs: Row[] = [];
const pregnancyTestLogs: Row[] = [];
const nestBoxLogs: Row[] = [];
const resorptionLogs: Row[] = [];
const kindlingLogs: Row[] = [];
const weaningLogs: Row[] = [];
const kitDeathLogs: Row[] = [];
const fosterLogs: Row[] = [];
const kitStockMovements: Row[] = [];
const transactions: Row[] = [];
const weightRecords: Row[] = [];
const healthRecords: Row[] = [];

const BREED_NAMES = ["نيوزيلندي أبيض", "كاليفورنيا", "بوسكات", "خليط"] as const;
const breeds: Row[] = BREED_NAMES.map((name) => ({
  id: id(),
  name,
  createdAt: iso(SIM_START),
}));

/* ─────────────────────────── the herd ──────────────────────────── */

const BUCK_COUNT = Math.max(8, Math.round(ACTIVE_DOES / 8));

const buckIds: string[] = [];
for (let i = 1; i <= BUCK_COUNT; i++) {
  const acquired = daysAgo(int(SIM_DAYS + 20, SIM_DAYS + 90));
  const buckId = id();
  buckIds.push(buckId);
  rabbits.push({
    id: buckId,
    tagId: String(i),
    retiredTagId: null,
    breed: pick(BREED_NAMES),
    color: null,
    sex: "buck",
    dateOfBirth: iso(addDays(acquired, -int(150, 260))),
    status: "active",
    doeState: "empty",
    cage: `B${i}`,
    origin: "external",
    movedToHerdPen: true,
    acquiredDate: iso(acquired),
    acquiredFrom: "مزرعة موردة",
    notes: null,
    photoUrl: null,
    sireId: null,
    damId: null,
    litterId: null,
    createdAt: iso(acquired),
    updatedAt: iso(acquired),
  });
}

/**
 * Doe quality tiers. The «idle» tier is not padding — it is the population the
 * whole إنتاجية القطيع tab exists to make visible: does that sit in a cage,
 * eat, and complete almost no cycles. A generator where every doe performs
 * would make the herd-level and the event-level averages agree, and prove
 * nothing about the report.
 */
const TIERS = [
  { name: "excellent", share: 0.35, conception: 0.9, litter: [8, 12] as const, restDays: [0, 4] as const },
  { name: "good", share: 0.35, conception: 0.8, litter: [6, 10] as const, restDays: [0, 8] as const },
  { name: "weak", share: 0.2, conception: 0.6, litter: [4, 8] as const, restDays: [3, 20] as const },
  { name: "idle", share: 0.1, conception: 0.25, litter: [3, 7] as const, restDays: [25, 90] as const },
];

function rollTier() {
  const r = rng();
  let acc = 0;
  for (const tier of TIERS) {
    acc += tier.share;
    if (r <= acc) return tier;
  }
  return TIERS[TIERS.length - 1];
}

type Doe = {
  id: string;
  tagId: string | null;
  tier: (typeof TIERS)[number];
  enteredAt: Date;
  /** Set for the does that leave the herd mid-year. */
  exitAt: Date | null;
  exitStatus: "deceased" | "culled" | null;
};

const does: Doe[] = [];

/** 8 does die and 6 are culled during the year — the النافق/الاستبعاد reports need something to show. */
const DECEASED_COUNT = Math.max(2, Math.round(ACTIVE_DOES * 0.04));
const CULLED_COUNT = Math.max(2, Math.round(ACTIVE_DOES * 0.03));

for (let i = 1; i <= ACTIVE_DOES + DECEASED_COUNT + CULLED_COUNT; i++) {
  const isDeceased = i > ACTIVE_DOES && i <= ACTIVE_DOES + DECEASED_COUNT;
  const isCulled = i > ACTIVE_DOES + DECEASED_COUNT;

  // Most of the herd predates the simulation window; the rest are bought in
  // during the year, so the report has does with only a partial history —
  // which is exactly the case a naive "÷ number of does" would treat unfairly.
  const enteredAt = chance(0.8)
    ? daysAgo(int(SIM_DAYS + 10, SIM_DAYS + 120))
    : daysAgo(int(40, SIM_DAYS - 30));

  const exitAt = isDeceased || isCulled ? daysAgo(int(10, SIM_DAYS - 60)) : null;

  does.push({
    id: id(),
    // A نافقة doe's number is freed for reuse (setRabbitStatusOp nulls tagId and
    // keeps the old one in retiredTagId), a مستبعدة doe keeps hers.
    tagId: isDeceased ? null : String(isCulled ? 200 + (i - ACTIVE_DOES - DECEASED_COUNT) : i),
    tier: rollTier(),
    enteredAt,
    exitAt,
    exitStatus: isDeceased ? "deceased" : isCulled ? "culled" : null,
  });
}

for (const [index, doe] of does.entries()) {
  rabbits.push({
    id: doe.id,
    tagId: doe.tagId,
    retiredTagId: doe.exitStatus === "deceased" ? String(index + 1) : null,
    breed: pick(BREED_NAMES),
    color: null,
    sex: "doe",
    dateOfBirth: iso(addDays(doe.enteredAt, -int(150, 300))),
    status: doe.exitStatus ?? "active",
    doeState: "empty", // overwritten below from her final cycle
    cage: `A${index + 1}`,
    origin: chance(0.85) ? "external" : "farm",
    movedToHerdPen: true,
    acquiredDate: iso(doe.enteredAt),
    acquiredFrom: "مزرعة موردة",
    notes: null,
    photoUrl: null,
    sireId: null,
    damId: null,
    litterId: null,
    createdAt: iso(doe.enteredAt),
    // The app has no exit-date column: the mortality/culling reports read
    // updatedAt as the date of death or culling (see src/app/mortality/page.tsx),
    // so it has to carry that here too or those two reports come out empty.
    updatedAt: iso(doe.exitAt ?? doe.enteredAt),
  });
}

/* ──────────────────── phase 1: the event timeline ──────────────── */

type Cycle = {
  doe: Doe;
  buckId: string;
  matingDate: Date;
  wasNursingAtMating: boolean;
  conceived: boolean;
  testDate: Date;
  /** null when the pregnancy was resorbed before term. */
  kindlingDate: Date | null;
  resorptionDate: Date | null;
  nestBoxDate: Date | null;
  /** Frozen at birth — never touched again, like bornAliveAtKindling. */
  bornAliveAtKindling: number;
  bornDeadAtKindling: number;
  /** Live counts, moved by fostering and kit deaths below. */
  bornAlive: number;
  bornDead: number;
  weaningDate: Date | null;
  weaned: number | null;
  weaningWeightGrams: number | null;
};

const cycles: Cycle[] = [];

for (const doe of does) {
  const endOfLife = doe.exitAt ?? TODAY;
  // She can't be mated before she arrives, and a freshly-bought doe is given a
  // few days to settle rather than being served on arrival.
  let cursor = addDays(doe.enteredAt < SIM_START ? SIM_START : doe.enteredAt, int(2, 25));
  let nursingUntil: Date | null = null;

  while (cursor < endOfLife) {
    const matingDate = new Date(cursor);
    const buckId = pick(buckIds);
    const wasNursingAtMating = nursingUntil != null && matingDate < nursingUntil;
    const conceived = chance(doe.tier.conception);
    const testDate = addDays(matingDate, PREGNANCY_TEST_DAYS);

    const cycle: Cycle = {
      doe,
      buckId,
      matingDate,
      wasNursingAtMating,
      conceived,
      testDate,
      kindlingDate: null,
      resorptionDate: null,
      nestBoxDate: null,
      bornAliveAtKindling: 0,
      bornDeadAtKindling: 0,
      bornAlive: 0,
      bornDead: 0,
      weaningDate: null,
      weaned: null,
      weaningWeightGrams: null,
    };

    if (!conceived) {
      // Negative test → straight back into the mating rotation.
      cycles.push(cycle);
      cursor = addDays(testDate, int(2, 10));
      continue;
    }

    // ~5% of confirmed pregnancies resorb rather than reaching term. Without
    // them «عشار» would always equal «الولادات» and the resorption archive
    // would be empty.
    if (chance(0.05)) {
      cycle.resorptionDate = addDays(matingDate, int(16, 24));
      cycles.push(cycle);
      cursor = addDays(cycle.resorptionDate, int(3, 12));
      continue;
    }

    cycle.nestBoxDate = addDays(matingDate, NEST_BOX_DAYS);
    const kindlingDate = addDays(matingDate, GESTATION_DAYS + int(-1, 2));
    if (kindlingDate >= endOfLife) {
      // She's still pregnant today (or died carrying) — record the mating and
      // stop; the current-state pass below turns this into her live doeState.
      cycles.push(cycle);
      break;
    }

    cycle.kindlingDate = kindlingDate;
    const [lo, hi] = doe.tier.litter;
    cycle.bornAliveAtKindling = int(lo, hi);
    cycle.bornDeadAtKindling = chance(0.45) ? int(1, 3) : 0;
    cycle.bornAlive = cycle.bornAliveAtKindling;
    cycle.bornDead = cycle.bornDeadAtKindling;

    cycles.push(cycle);
    nursingUntil = addDays(kindlingDate, WEANING_DAYS);
    const [restLo, restHi] = doe.tier.restDays;
    cursor = addDays(kindlingDate, REBREED_AFTER_KINDLING_DAYS + int(restLo, restHi));
  }
}

/* ──────────────── phase 2: fostering (تبني) ─────────────────────── */

/**
 * Runs over the kindlings day by day, exactly like the /fostering page's
 * decision aid: a doe with a big litter donates to one with a small litter born
 * within the same two-day window. It moves bornAlive only — never bornDead —
 * which is the behaviour transferKitsOp has and the reason kitsUnderCare in
 * src/lib/kit-mortality.ts reconstructs survival the way it does.
 */
const kindled = cycles.filter((c) => c.kindlingDate).sort((a, b) => a.kindlingDate!.getTime() - b.kindlingDate!.getTime());
for (let i = 0; i < kindled.length; i++) {
  const donor = kindled[i];
  if (donor.bornAlive < 9 || !chance(0.35)) continue;
  const receiver = kindled
    .slice(i + 1)
    .find(
      (c) =>
        c.bornAlive <= 4 &&
        c.doe.id !== donor.doe.id &&
        Math.abs(c.kindlingDate!.getTime() - donor.kindlingDate!.getTime()) <= 2 * DAY_MS
    );
  if (!receiver) continue;

  const count = Math.min(donor.bornAlive - 7, 5 - receiver.bornAlive);
  if (count <= 0) continue;
  donor.bornAlive -= count;
  receiver.bornAlive += count;
  fosterLogs.push({
    id: id(),
    fromDoeId: donor.doe.id,
    toDoeId: receiver.doe.id,
    count,
    date: iso(addDays(donor.kindlingDate!, 1)),
    createdAt: iso(addDays(donor.kindlingDate!, 1)),
  });
}

/* ──────────── phase 3: deaths, weaning, and the archives ───────── */

for (const cycle of cycles) {
  const { doe, buckId, matingDate } = cycle;

  matingLogs.push({
    id: id(),
    doeId: doe.id,
    buckId,
    matingDate: iso(matingDate),
    wasNursingAtMating: cycle.wasNursingAtMating,
    createdAt: iso(matingDate),
  });

  // The pregnancy test is only logged once it has actually come round.
  if (cycle.testDate <= TODAY) {
    pregnancyTestLogs.push({
      id: id(),
      doeId: doe.id,
      buckId,
      matingDate: iso(matingDate),
      testDate: iso(cycle.testDate),
      result: cycle.conceived ? "positive" : "negative",
      createdAt: iso(cycle.testDate),
    });
  }

  if (cycle.resorptionDate) {
    resorptionLogs.push({
      id: id(),
      doeId: doe.id,
      buckId,
      matingDate: iso(matingDate),
      resorptionDate: iso(cycle.resorptionDate),
      createdAt: iso(cycle.resorptionDate),
    });
  }

  if (cycle.nestBoxDate && cycle.nestBoxDate <= TODAY) {
    nestBoxLogs.push({
      id: id(),
      doeId: doe.id,
      breedingId: null,
      nestBoxDate: iso(cycle.nestBoxDate),
      createdAt: iso(cycle.nestBoxDate),
    });
  }

  if (!cycle.kindlingDate) continue;

  // Pre-weaning losses: each recorded death does bornAlive--, bornDead++ in one
  // move, the way recordNursingKitDeathOp does — which is what makes
  // «نافق الرعاية» (bornDead − bornDeadAtKindling) come out right.
  const kindlingLogId = id();
  let deaths = 0;
  if (chance(0.45)) deaths = int(1, Math.min(3, Math.max(1, cycle.bornAlive - 1)));
  if (chance(0.02)) deaths = cycle.bornAlive; // the occasional total loss

  let remaining = deaths;
  let deathCursor = addDays(cycle.kindlingDate, int(1, 6));
  while (remaining > 0 && deathCursor <= TODAY) {
    const n = Math.min(remaining, int(1, 2));
    cycle.bornAlive -= n;
    cycle.bornDead += n;
    remaining -= n;
    kitDeathLogs.push({
      id: id(),
      doeId: doe.id,
      breedingId: null,
      kindlingDate: iso(cycle.kindlingDate),
      deathDate: iso(deathCursor),
      count: n,
      createdAt: iso(deathCursor),
    });
    deathCursor = addDays(deathCursor, int(2, 7));
  }

  const weaningDate = addDays(cycle.kindlingDate, WEANING_DAYS + int(0, 4));
  const weanedNow = weaningDate <= TODAY && weaningDate <= (doe.exitAt ?? TODAY);
  if (weanedNow) {
    cycle.weaningDate = weaningDate;
    cycle.weaned = cycle.bornAlive;
    cycle.weaningWeightGrams = cycle.weaned > 0 ? cycle.weaned * int(560, 760) : null;
  }

  kindlingLogs.push({
    id: kindlingLogId,
    doeId: doe.id,
    buckId,
    breedingId: null,
    matingDate: iso(matingDate),
    kindlingDate: iso(cycle.kindlingDate),
    // Live counts — already moved by fostering and the deaths above.
    bornAlive: cycle.bornAlive,
    bornDead: cycle.bornDead,
    // Frozen at the ولادة press, never mirrored again.
    bornAliveAtKindling: cycle.bornAliveAtKindling,
    bornDeadAtKindling: cycle.bornDeadAtKindling,
    createdAt: iso(cycle.kindlingDate),
  });

  if (!weanedNow) continue;

  weaningLogs.push({
    id: id(),
    doeId: doe.id,
    buckId,
    breedingId: null,
    kindlingDate: iso(cycle.kindlingDate),
    weaningDate: iso(cycle.weaningDate!),
    bornAlive: cycle.bornAlive,
    bornDead: cycle.bornDead,
    bornDeadAtKindling: cycle.bornDeadAtKindling,
    weaned: cycle.weaned,
    weaningWeightGrams: cycle.weaningWeightGrams,
    createdAt: iso(cycle.weaningDate!),
  });
}

/* ─────────── phase 4: the weaned-kit ledger and the money ──────── */

/**
 * Every weaned kit leaves رصيد الفطام exactly once: sold, kept as سلالة, or
 * dead. Whatever is left over is the running balance the report prints — so
 * the deductions here are capped at what was actually weaned, or the balance
 * would go negative and «باقي الفطام» would print nonsense.
 */
for (const cycle of cycles) {
  if (!cycle.weaned || cycle.weaned <= 0) continue;
  const weanedAt = cycle.weaningDate!;
  let left = cycle.weaned;

  const died = chance(0.25) ? Math.min(left, int(1, 2)) : 0;
  if (died > 0) {
    left -= died;
    kitStockMovements.push({
      id: id(),
      date: iso(addDays(weanedAt, int(2, 20))),
      type: "death",
      count: died,
      weightGrams: null,
      pricePerKgCents: null,
      amountCents: null,
      transactionId: null,
      rabbitId: null,
      notes: null,
      createdAt: iso(addDays(weanedAt, int(2, 20))),
    });
  }

  const retained = chance(0.3) ? Math.min(left, int(1, 2)) : 0;
  if (retained > 0) {
    left -= retained;
    kitStockMovements.push({
      id: id(),
      date: iso(addDays(weanedAt, int(25, 45))),
      type: "retained",
      count: retained,
      weightGrams: null,
      pricePerKgCents: null,
      amountCents: null,
      transactionId: null,
      rabbitId: null,
      notes: null,
      createdAt: iso(addDays(weanedAt, int(25, 45))),
    });
  }

  // Kits are sold at ~2 kg, roughly a month after weaning. A couple are left
  // behind on purpose so the farm always carries some balance.
  const saleDate = addDays(weanedAt, int(28, 45));
  const sold = saleDate <= TODAY ? Math.max(0, left - (chance(0.3) ? int(1, 2) : 0)) : 0;
  if (sold > 0) {
    const weightGrams = sold * int(...KIT_SALE_WEIGHT_G);
    const amountCents = Math.round((weightGrams * PRICE_PER_KG_CENTS) / 1000);
    const transactionId = id();
    transactions.push({
      id: transactionId,
      rabbitId: null,
      date: iso(saleDate),
      type: "income",
      category: "sale",
      amountCents,
      notes: `بيع ${sold} أرنب فطام`,
      createdAt: iso(saleDate),
    });
    kitStockMovements.push({
      id: id(),
      date: iso(saleDate),
      type: "sale",
      count: sold,
      weightGrams,
      pricePerKgCents: PRICE_PER_KG_CENTS,
      amountCents,
      transactionId,
      rabbitId: null,
      notes: null,
      createdAt: iso(saleDate),
    });
  }
}

// Farm-level running costs. These are what إنتاجية القطيع allocates per doe —
// deliberately posted farm-wide with no rabbitId, because that is how a real
// farm books feed and vet bills and is the reason the report calls the per-doe
// cost an allocation rather than a measurement.
for (let day = 0; day <= SIM_DAYS; day += FEED_POSTING_INTERVAL_DAYS) {
  const date = addDays(SIM_START, day);
  if (date > TODAY) break;
  const amountCents =
    FEED_COST_PER_DOE_PER_DAY_CENTS * ACTIVE_DOES * FEED_POSTING_INTERVAL_DAYS +
    int(-40_000, 40_000);
  transactions.push({
    id: id(),
    rabbitId: null,
    date: iso(date),
    type: "expense",
    category: "feed",
    amountCents,
    notes: "علف",
    createdAt: iso(date),
  });
}
for (let day = 0; day <= SIM_DAYS; day += 30) {
  const date = addDays(SIM_START, day);
  if (date > TODAY) break;
  transactions.push({
    id: id(),
    rabbitId: null,
    date: iso(date),
    type: "expense",
    category: "vet",
    amountCents: VET_COST_PER_MONTH_CENTS + int(-60_000, 90_000),
    notes: "أدوية وتحصينات",
    createdAt: iso(date),
  });
  if (chance(0.3)) {
    transactions.push({
      id: id(),
      rabbitId: null,
      date: iso(addDays(date, int(1, 20))),
      type: "expense",
      category: "equipment",
      amountCents: int(50_000, 400_000),
      notes: "صيانة ومستلزمات",
      createdAt: iso(date),
    });
  }
}

/* ────────── phase 5: each doe's CURRENT cycle (Breeding/Litter) ── */

/**
 * One Breeding row per doe, holding only her latest cycle — the real app reuses
 * that row and overwrites matingDate/actualKindlingDate on every mating, which
 * is exactly why all the history above went into the *Log tables instead.
 * Her doeState is derived from where today falls inside that last cycle, so the
 * does board, عمليات المزرعة and «أمهات جاهزة للتلقيح» all have live work to show.
 */
const doeStateById = new Map<string, string>();

for (const doe of does) {
  const mine = cycles.filter((c) => c.doe.id === doe.id);
  const last = mine[mine.length - 1];
  const breedingId = id();

  if (!last) {
    // Never mated — a doe bought in days ago, or one of the idle tier that
    // never came into rotation.
    doeStateById.set(doe.id, "empty");
    continue;
  }

  let doeState = "empty";
  let matingDate: Date | null = null;
  let actualKindlingDate: Date | null = null;
  let nestBoxDate: Date | null = null;
  let pregnancyTestResult = "pending";
  let outcome = "pending";

  if (!last.kindlingDate && !last.resorptionDate) {
    // Still carrying, or waiting on her test.
    matingDate = last.matingDate;
    nestBoxDate = last.nestBoxDate && last.nestBoxDate <= TODAY ? last.nestBoxDate : null;
    if (!last.conceived) {
      doeState = last.testDate <= TODAY ? "empty" : "bred";
      pregnancyTestResult = last.testDate <= TODAY ? "negative" : "pending";
      outcome = last.testDate <= TODAY ? "not_pregnant" : "pending";
    } else if (last.testDate <= TODAY) {
      doeState = "pregnant";
      pregnancyTestResult = "positive";
    } else {
      doeState = "bred";
    }
  } else if (last.kindlingDate && !last.weaningDate) {
    // Kindled and still nursing — these are the does the weaning board lists.
    doeState = "nursing";
    actualKindlingDate = last.kindlingDate;
    outcome = "successful";
    litters.push({
      id: id(),
      breedingId,
      kindlingDate: iso(last.kindlingDate),
      bornAlive: last.bornAlive,
      bornDead: last.bornDead,
      weaned: null,
      weaningDate: null,
      weaningWeightGrams: null,
      notes: null,
      createdAt: iso(last.kindlingDate),
      updatedAt: iso(last.kindlingDate),
    });
  } else if (last.kindlingDate) {
    // Weaned; back in the mating rotation.
    doeState = "empty";
    actualKindlingDate = last.kindlingDate;
    outcome = "successful";
    litters.push({
      id: id(),
      breedingId,
      kindlingDate: iso(last.kindlingDate),
      bornAlive: last.bornAlive,
      bornDead: last.bornDead,
      weaned: last.weaned,
      weaningDate: iso(last.weaningDate!),
      weaningWeightGrams: last.weaningWeightGrams,
      notes: null,
      createdAt: iso(last.kindlingDate),
      updatedAt: iso(last.weaningDate!),
    });
  }

  doeStateById.set(doe.id, doeState);
  breedings.push({
    id: breedingId,
    buckId: last.buckId,
    doeId: doe.id,
    matingDate: matingDate ? iso(matingDate) : null,
    expectedKindlingDate: iso(addDays(last.matingDate, GESTATION_DAYS)),
    actualKindlingDate: actualKindlingDate ? iso(actualKindlingDate) : null,
    nestBoxDate: nestBoxDate ? iso(nestBoxDate) : null,
    palpationConfirmedDate: null,
    outcome,
    pregnancyTestResult,
    notes: null,
    createdAt: iso(last.matingDate),
    updatedAt: iso(last.weaningDate ?? last.kindlingDate ?? last.matingDate),
  });
}

for (const rabbit of rabbits) {
  if (rabbit.sex !== "doe") continue;
  // A doe that left the herd keeps no live reproductive state.
  rabbit.doeState =
    rabbit.status === "active" ? (doeStateById.get(rabbit.id as string) ?? "empty") : "empty";
}

/* ───────────── a little husbandry data for the rabbit pages ────── */

for (const rabbit of rabbits) {
  if (!chance(0.4)) continue;
  const base = new Date(rabbit.acquiredDate as string);
  for (let i = 0; i < int(1, 4); i++) {
    const date = addDays(base, int(10, SIM_DAYS));
    if (date > TODAY) continue;
    weightRecords.push({
      id: id(),
      rabbitId: rabbit.id,
      date: iso(date),
      weightGrams: int(3_100, 4_600),
      notes: null,
      createdAt: iso(date),
      updatedAt: iso(date),
    });
  }
  if (chance(0.25)) {
    const date = addDays(base, int(20, SIM_DAYS));
    if (date <= TODAY) {
      healthRecords.push({
        id: id(),
        rabbitId: rabbit.id,
        date: iso(date),
        type: pick(["vaccination", "treatment", "deworming", "checkup"]),
        description: pick(["تحصين دوري", "علاج جرب", "علاج نزلة معوية", "فحص عام"]),
        nextDueDate: null,
        createdAt: iso(date),
      });
    }
  }
}

/* ────────────────────────── write it out ───────────────────────── */

const data = {
  meta: {
    generatedAt: iso(new Date()),
    seed: SEED,
    simulatedDays: SIM_DAYS,
    activeDoes: ACTIVE_DOES,
    note: "Synthetic demo data generated by scripts/generate-demo-farm.mts — not a real farm.",
  },
  settings: {
    weightUnit: "kg",
    gestationDays: GESTATION_DAYS,
    gestationWindowDays: 3,
    pregnancyTestDays: PREGNANCY_TEST_DAYS,
    palpationCheckDays: 15,
    weaningDays: WEANING_DAYS,
    nestBoxDays: NEST_BOX_DAYS,
    matingWeightGrams: 3_000,
    rebreedAfterKindlingDays: REBREED_AFTER_KINDLING_DAYS,
    fosterWindowDays: 2,
    fosterHighKits: 8,
    fosterLowKits: 4,
    currency: CURRENCY,
  },
  breeds,
  rabbits,
  breedings,
  litters,
  weightRecords,
  healthRecords,
  transactions,
  kitStockMovements,
  pregnancyTestLogs,
  kindlingLogs,
  weaningLogs,
  nestBoxLogs,
  matingLogs,
  resorptionLogs,
  fosterLogs,
  kitDeathLogs,
};

writeFileSync(OUT_FILE, JSON.stringify(data));

const totalWeaned = weaningLogs.reduce((s, w) => s + ((w.weaned as number) ?? 0), 0);
const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + (t.amountCents as number), 0);
const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amountCents as number), 0);

console.log(`✔ ${OUT_FILE}`);
console.table({
  "أمهات (نشطة)": ACTIVE_DOES,
  "أمهات نافقة/مستبعدة": DECEASED_COUNT + CULLED_COUNT,
  ذكور: BUCK_COUNT,
  تلقيحات: matingLogs.length,
  ولادات: kindlingLogs.length,
  "مرات فطام": weaningLogs.length,
  "إجمالي المفطوم": totalWeaned,
  "نافق رعاية (سجلات)": kitDeathLogs.length,
  تبني: fosterLogs.length,
  امتصاص: resorptionLogs.length,
  "حركات مخزون": kitStockMovements.length,
  "معاملات مالية": transactions.length,
  "إيراد (ج.م)": Math.round(income / 100),
  "مصروف (ج.م)": Math.round(expense / 100),
});
