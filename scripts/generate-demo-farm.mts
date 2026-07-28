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
/**
 * Simulated horizon. Deliberately longer than a year even though nobody reads
 * an 18-month report: a farm started from an empty barn sells nothing for its
 * first three months while the first litters are still growing, and any window
 * that reaches back into that stretch prices a full year's feed against a
 * partial year's meat. It made the demo look like it lost 176,000 EGP. The
 * extra ~185 days are a warm-up so that even a 365-day window lands entirely
 * inside the steady state.
 */
const SIM_DAYS = flag("days", 550);

/** The farm's own settings — these drive what the report calls "المستهدف". */
const GESTATION_DAYS = 31;
const REBREED_AFTER_KINDLING_DAYS = 10; // نصف مكثف → 8 دورات في السنة
const WEANING_DAYS = 28;
const PREGNANCY_TEST_DAYS = 10;
const NEST_BOX_DAYS = 27;
const CURRENCY = "EGP";

/**
 * Market assumptions, in the smallest currency unit (piastres), at real
 * Egyptian prices rather than round numbers. These two are the whole economic
 * story of a meat farm and they are close enough together that everything else
 * is a rounding error: 3.5–4 kg of feed goes into every kg of live rabbit, so
 * a farm buying feed at 19,000/ton has already spent 66–76 of the 100 it gets
 * back before rent, wages, medicine or a single dead kit.
 */
const PRICE_PER_KG_CENTS = 10_000; // 100 ج.م/كجم قائم
const FEED_PRICE_PER_TON_CENTS = 1_900_000; // 19,000 ج.م/طن
const KIT_SALE_WEIGHT_G = [1_900, 2_400] as const;
const FEED_POSTING_INTERVAL_DAYS = 15;
const VET_COST_PER_MONTH_CENTS = 300_000; // 3,000 ج.م

/**
 * Daily ration per head, in grams, by animal class — the same six numbers the
 * app now stores in Settings (see src/lib/feed-plan.ts). The feed bill below is
 * simulated FROM these against the herd's actual state day by day, not from a
 * flat per-doe figure: a flat figure charges an idle barn and a full one the
 * same money, which is precisely the error that made the previous dataset lose
 * money for reasons no report could explain.
 */
const RATIONS = {
  doeIdle: 150,
  doePregnant: 200,
  doeNursing: 275, // هي وخلفتها
  buck: 200,
  grower: 100, // بعد الفطام وحتى البيع
  juvenile: 150, // سلالة
} as const;

/**
 * The fixed monthly costs that existed on every real farm and in none of this
 * app's data until now. Scaled off the doe count so a --does=50 run doesn't
 * carry a 200-doe payroll: one worker per ~120 does is the usual staffing.
 */
const RENT_PER_MONTH_CENTS = Math.round((ACTIVE_DOES / 100) * 150_000); // 1,500 ج.م لكل 100 أم
const UTILITIES_PER_MONTH_CENTS = Math.round((ACTIVE_DOES / 100) * 75_000); // 750 ج.م لكل 100 أم
const WORKERS = Math.max(1, Math.round(ACTIVE_DOES / 120));
const SALARY_PER_WORKER_PER_MONTH_CENTS = 600_000; // 6,000 ج.م

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
 *
 * The litter ranges are set for the stock these farms actually run — hybrid
 * does, not pure lines — which puts خلفة حية عند الولادة at about 6.3 per
 * litter herd-wide. They used to average 8.3, a pure-line figure: flattering,
 * and wrong in the direction that matters, since a demo farm is what someone
 * measures their own numbers against before they trust the app with them.
 */
const TIERS = [
  { name: "excellent", share: 0.35, conception: 0.9, litter: [6, 9] as const, restDays: [0, 4] as const },
  { name: "good", share: 0.35, conception: 0.8, litter: [5, 8] as const, restDays: [0, 8] as const },
  { name: "weak", share: 0.2, conception: 0.6, litter: [3, 5] as const, restDays: [3, 20] as const },
  { name: "idle", share: 0.1, conception: 0.25, litter: [2, 5] as const, restDays: [25, 90] as const },
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
  /** The number she wore while she was in the herd, kept even after it is retired. */
  originalTag: string;
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

  // Leaving the herd frees the number for reuse: setRabbitStatusOp nulls tagId
  // and parks the old one in retiredTagId, for نافقة and مستبعدة alike. So an
  // exited doe here has to be untagged too — otherwise the demo farm shows
  // fourteen numbered does the real app could never produce.
  const originalTag = String(i);
  does.push({
    id: id(),
    tagId: isDeceased || isCulled ? null : originalTag,
    originalTag,
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
    // Same shape setRabbitStatusOp writes: the number, then how and when it
    // was retired — it is the only trace of her tag left on the row.
    retiredTagId: doe.exitStatus
      ? `${doe.originalTag} (${doe.exitStatus === "deceased" ? "نافق" : "استبعاد"} ${iso(doe.exitAt!).slice(0, 10)})`
      : null,
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
    // ~0.5 stillborn per litter. The old 45%×(1–3) averaged 1.9, which is a
    // figure you see in a herd with a real problem, not in a working barn.
    cycle.bornDeadAtKindling = chance(0.3) ? int(1, 2) : 0;
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
  // ~13% pre-weaning mortality across the herd, which is where a farm that
  // checks its nest boxes lands. It used to be ~24%, and once feed is priced at
  // 19,000/ton that difference is not a detail: a kit that dies at two weeks has
  // already been paid for in its mother's nursing ration and returns nothing.
  let deaths = 0;
  if (chance(0.3)) deaths = int(1, Math.min(2, Math.max(1, cycle.bornAlive - 1)));
  if (chance(0.015)) deaths = cycle.bornAlive; // the occasional total loss

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

/* ───────────────── السلالات: the retained kits ──────────────────── */

/** A retained kit inherits its dam's breed, so the herd stays believable. */
const breedByRabbitId = new Map(rabbits.map((r) => [r.id as string, r.breed as string]));

/** Ids of the kits kept as سلالة, so the husbandry rounds below can tell the
 *  young stock apart from the breeding herd without guessing from `origin`. */
const stockKitIds = new Set<string>();

/** What a young breeder fetches, per head — sold by animal, not by weight. */
const STOCK_SALE_PRICE_CENTS = 25_000; // 250 ج.م

/**
 * Turns one weaned kit into a سلالة: the Rabbit row, the "retained" movement
 * that deducted it from رصيد الفطام, its intake weight, and whatever became of
 * it afterwards.
 *
 * Untagged on purpose. The reports split the herd by tag, not by age:
 * الأمهات/الذكور are `tagId != null && active`, السلالات is `tagId == null &&
 * active`, and «نافق السلالات» is `tagId == null && deceased` (see
 * src/app/reports/report-data.ts). Giving a kit a number would file it as a
 * breeding doe that somehow never mated.
 */
/** Returns the day the kit stopped eating this farm's feed — its exit, or today. */
function retainStockKit(cycle: Cycle, retainedAt: Date): Date {
  const rabbitId = id();
  stockKitIds.add(rabbitId);
  const sex = chance(0.6) ? "doe" : "buck";

  // Most are sold on as young breeders within a few months; the ones whose exit
  // date has not arrived yet are the standing stock the age buckets show.
  const exitAt = addDays(retainedAt, int(20, 150));
  const hasLeft = exitAt <= TODAY;
  const roll = rng();
  // Sold-on stock is booked as "culled" (استبعاد) — «مباع» is offered by the
  // status menu but no board excludes it: every "still on the farm" query in
  // the app is `status NOT IN (deceased, culled)`, in 45 places across web and
  // mobile, so a rabbit marked مباع keeps showing up in the herd. Using it here
  // would put animals that left the farm back on the does and stock screens.
  const status = !hasLeft ? "active" : roll < 0.9 ? "culled" : "deceased";

  rabbits.push({
    id: rabbitId,
    tagId: null,
    retiredTagId: null,
    breed: breedByRabbitId.get(cycle.doe.id) ?? pick(BREED_NAMES),
    color: null,
    sex,
    dateOfBirth: iso(cycle.kindlingDate!),
    status,
    doeState: "empty",
    cage: null,
    origin: "farm",
    movedToHerdPen: false,
    acquiredDate: iso(retainedAt),
    acquiredFrom: null,
    notes: null,
    photoUrl: null,
    // The whole point of keeping a kit: it has a known sire and dam.
    sireId: cycle.buckId,
    damId: cycle.doe.id,
    // Deliberately null: the Litter row this kit came from was recycled by the
    // dam's next kindling weeks before the retention, so there is nothing left
    // to point at. Its parentage is carried by sireId/damId instead.
    litterId: null,
    createdAt: iso(retainedAt),
    // The mortality and culling reports read updatedAt as the exit date.
    updatedAt: iso(hasLeft ? exitAt : retainedAt),
  });

  kitStockMovements.push({
    id: id(),
    date: iso(retainedAt),
    type: "retained",
    count: 1,
    weightGrams: null,
    pricePerKgCents: null,
    amountCents: null,
    transactionId: null,
    rabbitId,
    notes: null,
    createdAt: iso(retainedAt),
  });

  weightRecords.push({
    id: id(),
    rabbitId,
    date: iso(retainedAt),
    weightGrams: int(1_800, 2_400),
    notes: null,
    createdAt: iso(retainedAt),
    updatedAt: iso(retainedAt),
  });

  if (status === "culled") {
    // Sold by the head, not by the kilo — this is breeding stock leaving the
    // farm, not meat. It never touches رصيد الفطام again: the kit left that
    // ledger the day it was retained.
    transactions.push({
      id: id(),
      rabbitId,
      date: iso(exitAt),
      type: "income",
      category: "sale",
      amountCents: STOCK_SALE_PRICE_CENTS + int(-4_000, 8_000),
      notes: `بيع سلالة (${sex === "doe" ? "أنثى" : "ذكر"})`,
      createdAt: iso(exitAt),
    });
  }
  if (hasLeft && status !== "deceased") {
    weightRecords.push({
      id: id(),
      rabbitId,
      date: iso(exitAt),
      weightGrams: int(2_900, 3_700),
      notes: null,
      createdAt: iso(exitAt),
      updatedAt: iso(exitAt),
    });
  }

  return hasLeft ? exitAt : TODAY;
}

/* ─────────── phase 4: the weaned-kit ledger and the money ──────── */

/**
 * Every weaned kit leaves رصيد الفطام exactly once: sold, kept as سلالة, or
 * dead. Whatever is left over is the running balance the report prints — so
 * the deductions here are capped at what was actually weaned, or the balance
 * would go negative and «باقي الفطام» would print nonsense.
 *
 * Mouths the feed model has to pay for that aren't breeding animals are
 * collected as they go: every weaned kit from the day it leaves its mother to
 * the day it leaves the farm, and every retained سلالة from retention to its
 * exit. They are gathered here rather than recomputed later because the sale
 * date is decided inside this loop and nowhere else.
 */
const growerSpans: { from: Date; to: Date; head: number; ration: number }[] = [];

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

  // Kept for breeding. Unlike a sale or a death — which are batch counts with
  // no row behind them — a retention creates an actual animal: the app writes
  // ONE movement per rabbit, linked 1:1 through KitStockMovement.rabbitId (see
  // createQuickRabbitOp). So this loop emits one movement AND one Rabbit per
  // kit, or the farm reports 379 kits retained into a السلالات table that is
  // empty on every screen that reads it.
  //
  // ~7% of weanings keep one kit, which over a year replaces roughly a third of
  // the does — the normal replacement rate. It used to be 30%×(1–2), i.e. ~450
  // young breeders a year for a 200-doe herd: nearly two replacements per doe
  // per year, each one eating a سلالة ration for months and then leaving at a
  // young-breeder price. That single number was quietly costing the demo farm
  // more than its rent.
  const retained = chance(0.07) ? Math.min(left, 1) : 0;
  for (let k = 0; k < retained; k++) {
    left -= 1;
    const retainedAt = addDays(weanedAt, int(25, 45));
    if (retainedAt > TODAY) {
      left += 1;
      break;
    }
    const leftAt = retainStockKit(cycle, retainedAt);
    growerSpans.push({ from: retainedAt, to: leftAt, head: 1, ration: RATIONS.juvenile });
  }

  // Kits go out whole at ~2.1 kg, 45–60 days after weaning — i.e. around 80
  // days old, which is when a rabbit eating 100g a day actually gets there:
  // 0.6 kg at weaning to 2.1 kg at sale is 1.5 kg of gain, and at the 3.3–3.5
  // conversion of the fattening phase that is roughly 5 kg of feed, which is
  // fifty days' ration and not thirty. The window used to be 28–45 days, and
  // the cost of that shortcut was invisible until the report started printing
  // a feed-conversion ratio: the demo farm was showing 2.9 kg of feed per kg of
  // meat, a number no rabbit has ever achieved.
  //
  // Nothing is held back on purpose either: the standing رصيد الفطام comes from
  // the batches whose sale date simply hasn't arrived yet, which is where a
  // real farm's balance comes from too.
  const saleDate = addDays(weanedAt, int(45, 60));
  const sold = saleDate <= TODAY ? left : 0;
  growerSpans.push({
    from: weanedAt,
    to: sold > 0 ? saleDate : TODAY,
    head: cycle.weaned,
    ration: RATIONS.grower,
  });
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
/**
 * The feed bill, simulated day by day off the herd this run actually produced
 * rather than off a flat per-doe rate. Each day accumulates grams: every living
 * doe eats her idle ration as a baseline, and pregnancy and lactation are added
 * on top as uplifts over exactly the days she was in that state, so a farm that
 * bred badly in March pays less in April — which is the entire point of putting
 * a feed number in front of the farmer.
 */
const gramsOnDay = new Float64Array(SIM_DAYS + 1);
const dayIndex = (d: Date) => Math.round((d.getTime() - SIM_START.getTime()) / 86_400_000);

function eat(from: Date, to: Date | null, head: number, gramsPerHead: number) {
  if (!to || head <= 0 || gramsPerHead === 0) return;
  const first = Math.max(0, dayIndex(from));
  const last = Math.min(SIM_DAYS, dayIndex(to));
  for (let d = first; d <= last; d++) gramsOnDay[d] += head * gramsPerHead;
}

for (const doe of does) {
  eat(doe.enteredAt, doe.exitAt ?? TODAY, 1, RATIONS.doeIdle);
}
for (const cycle of cycles) {
  // Uplifts, not replacements: the idle baseline above already covers her.
  const carriedUntil = cycle.kindlingDate ?? cycle.resorptionDate;
  eat(cycle.matingDate, carriedUntil, 1, RATIONS.doePregnant - RATIONS.doeIdle);
  if (cycle.kindlingDate) {
    eat(cycle.kindlingDate, cycle.weaningDate, 1, RATIONS.doeNursing - RATIONS.doeIdle);
  }
}
eat(SIM_START, TODAY, BUCK_COUNT, RATIONS.buck);
for (const span of growerSpans) eat(span.from, span.to, span.head, span.ration);

for (let day = 0; day <= SIM_DAYS; day += FEED_POSTING_INTERVAL_DAYS) {
  const date = addDays(SIM_START, day);
  if (date > TODAY) break;
  let grams = 0;
  for (let d = day; d < day + FEED_POSTING_INTERVAL_DAYS && d <= SIM_DAYS; d++) {
    grams += gramsOnDay[d];
  }
  if (grams <= 0) continue;
  // ±3% — real invoices never land on the calculated gram, and a ledger where
  // every feed row is arithmetically perfect reads as fabricated.
  const amountCents = Math.round(
    ((grams * FEED_PRICE_PER_TON_CENTS) / 1_000_000) * (1 + int(-30, 30) / 1000)
  );
  transactions.push({
    id: id(),
    rabbitId: null,
    date: iso(date),
    type: "expense",
    category: "feed",
    amountCents,
    notes: `علف — ${Math.round(grams / 1000).toLocaleString("ar-EG")} كجم`,
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
  // The overheads that don't care how the herd performed. They are flat by
  // design — that is what makes them the thing a farm has to out-produce, and
  // the reason a half-empty barn bleeds money while a full one doesn't.
  transactions.push({
    id: id(),
    rabbitId: null,
    date: iso(date),
    type: "expense",
    category: "rent",
    amountCents: RENT_PER_MONTH_CENTS,
    notes: "إيجار المزرعة",
    createdAt: iso(date),
  });
  transactions.push({
    id: id(),
    rabbitId: null,
    date: iso(date),
    type: "expense",
    category: "salaries",
    amountCents: WORKERS * SALARY_PER_WORKER_PER_MONTH_CENTS,
    notes: `مرتبات ${WORKERS.toLocaleString("ar-EG")} عامل`,
    createdAt: iso(date),
  });
  transactions.push({
    id: id(),
    rabbitId: null,
    date: iso(date),
    type: "expense",
    category: "utilities",
    amountCents: UTILITIES_PER_MONTH_CENTS + int(-10_000, 15_000),
    notes: "كهرباء ومياه",
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

/* ────────────────── husbandry: weights and health ───────────────── */

/**
 * These two tables used to be an afterthought — 40% of the herd, one to four
 * weights at random dates, a quarter of them one health record with a null
 * nextDueDate. On a 239-head farm that came out as 171 weights and 14 health
 * records, so صفحة الصحة showed four empty cards next to a farm with 1,101
 * kindlings, and «التطعيمات القادمة/المتأخرة» could never show anything at all
 * because they are driven entirely by nextDueDate.
 *
 * A working farm weighs and vaccinates on a ROUND, not at random: everything in
 * the herd on the day gets a row. So both loops below walk the calendar and
 * cover whoever was actually present, which is what makes the numbers on the
 * صحة and الأوزان screens belong to the same farm as the breeding screens.
 */
const WEIGH_IN_INTERVAL_DAYS = 60;
const VACCINATION_INTERVAL_DAYS = 180;
const DEWORMING_INTERVAL_DAYS = 120;

/** Alive and on the farm on `date` — exit is carried by updatedAt, as everywhere else. */
const presentOn = (rabbit: Row, date: Date) => {
  const from = new Date((rabbit.acquiredDate as string) ?? (rabbit.createdAt as string));
  if (date < from) return false;
  if (rabbit.status === "active") return true;
  return date <= new Date(rabbit.updatedAt as string);
};

/** The breeding herd: the retained kits already carry their own intake/exit weights. */
const breeders = rabbits.filter((r) => !stockKitIds.has(r.id as string));

for (const rabbit of breeders) {
  // Offset per animal so the whole herd is not weighed on the same four days.
  const offset = int(0, WEIGH_IN_INTERVAL_DAYS - 1);
  for (let day = offset; day <= SIM_DAYS; day += WEIGH_IN_INTERVAL_DAYS) {
    const date = addDays(SIM_START, day);
    if (date > TODAY || !presentOn(rabbit, date)) continue;
    weightRecords.push({
      id: id(),
      rabbitId: rabbit.id,
      date: iso(date),
      weightGrams: rabbit.sex === "buck" ? int(3_600, 4_800) : int(3_400, 4_600),
      notes: null,
      createdAt: iso(date),
      updatedAt: iso(date),
    });
  }
}

const health = (rabbit: Row, date: Date, type: string, description: string, nextDue: Date | null) =>
  healthRecords.push({
    id: id(),
    rabbitId: rabbit.id,
    date: iso(date),
    type,
    description,
    // The only thing صفحة الصحة's «متأخر» and «قادم» cards read. A round that
    // books no next date is a round the farm can never be reminded about.
    nextDueDate: nextDue ? iso(nextDue) : null,
    createdAt: iso(date),
  });

/**
 * One recurring treatment, repeated across the year at `every` days.
 *
 * Only the LAST dose carries a nextDueDate. صفحة الصحة lists every record with
 * one and never asks whether a later dose superseded it, so dating them all
 * would file each animal's whole vaccination history under «متأخر» — hundreds
 * of rows demanding a shot that was already given. The reminder belongs to the
 * dose that is actually outstanding.
 */
function round(rabbit: Row, every: number, type: string, description: string) {
  const dates: Date[] = [];
  for (let day = int(0, every - 1); day <= SIM_DAYS; day += every) {
    const date = addDays(SIM_START, day);
    if (date > TODAY || !presentOn(rabbit, date)) continue;
    dates.push(date);
  }
  // One animal in ten is behind: it missed its latest round, so the reminder
  // left standing is the previous one and it is already past due. Without this
  // every due date is by construction in the future and صفحة الصحة's «متأخر»
  // card can only ever say صفر, which is not what a real farm looks like.
  if (dates.length > 1 && chance(0.1)) dates.pop();
  dates.forEach((date, i) => {
    const isLast = i === dates.length - 1;
    // No next dose for an animal that has since left the farm.
    const due = isLast && rabbit.status === "active" ? addDays(date, every) : null;
    health(rabbit, date, type, description, due);
  });
}

for (const rabbit of breeders) {
  round(rabbit, VACCINATION_INTERVAL_DAYS, "vaccination", "تحصين ضد التسمم الدموي");
  round(rabbit, DEWORMING_INTERVAL_DAYS, "deworming", "علاج الطفيليات الداخلية");

  // Individual episodes, unlike the rounds above: one animal, one problem, no
  // next date — they are what makes the recent-history list read like a farm
  // rather than a schedule.
  for (let i = 0; i < int(0, 2); i++) {
    const date = addDays(SIM_START, int(0, SIM_DAYS));
    if (date > TODAY || !presentOn(rabbit, date)) continue;
    const [type, description] = pick([
      ["treatment", "علاج جرب"],
      ["treatment", "علاج نزلة معوية"],
      ["treatment", "علاج التهاب الضرع"],
      ["checkup", "فحص عام"],
    ] as const);
    health(rabbit, date, type, description, null);
  }
}

// The retained kits get their intake dose on the day they enter السلالات, so
// the صحة screen covers the young stock too and not just the breeders.
for (const rabbit of rabbits) {
  if (!stockKitIds.has(rabbit.id as string)) continue;
  const date = new Date(rabbit.acquiredDate as string);
  const due = rabbit.status === "active" ? addDays(date, VACCINATION_INTERVAL_DAYS) : null;
  health(rabbit, date, "vaccination", "تحصين السلالات عند الفرز", due);
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
    // The money side of Settings, filled from the same constants the ledger
    // above was simulated with — so the «خطة العلف» panel and the ledger tell
    // the same story instead of two unrelated ones.
    defaultPricePerKgCents: PRICE_PER_KG_CENTS,
    feedPricePerTonCents: FEED_PRICE_PER_TON_CENTS,
    feedGramsDoeIdlePerDay: RATIONS.doeIdle,
    feedGramsDoePregnantPerDay: RATIONS.doePregnant,
    feedGramsDoeNursingPerDay: RATIONS.doeNursing,
    feedGramsBuckPerDay: RATIONS.buck,
    feedGramsGrowerPerDay: RATIONS.grower,
    feedGramsJuvenilePerDay: RATIONS.juvenile,
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
// The same arithmetic إنتاجية القطيع does, printed here so a regenerated dataset
// can be sanity-checked without loading it into a database first. Measured over
// the LAST 365 days, not the whole simulated horizon: the warm-up months
// deliberately sit outside it (see SIM_DAYS), and including them would report a
// year's costs against a partial year's sales — the exact distortion the
// warm-up exists to keep out of the farmer's report.
const YEAR_START = addDays(TODAY, -365);
const inYear = (d: unknown) => new Date(d as string) >= YEAR_START;
const yearTx = transactions.filter((t) => inYear(t.date));
const yearSales = kitStockMovements.filter((m) => m.type === "sale" && inYear(m.date));
const sum = <T extends Record<string, unknown>>(rows: T[], key: string) =>
  rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);

const income = sum(
  yearTx.filter((t) => t.type === "income"),
  "amountCents"
);
const expense = sum(
  yearTx.filter((t) => t.type === "expense"),
  "amountCents"
);
const feedCents = sum(
  yearTx.filter((t) => t.category === "feed"),
  "amountCents"
);
const saleCents = sum(yearSales, "amountCents");
const kgSold = sum(yearSales, "weightGrams") / 1000;
const feedKg = (feedCents / FEED_PRICE_PER_TON_CENTS) * 1000;
const breakEven = kgSold > 0 ? (expense - (income - saleCents)) / kgSold : 0;

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
  "إيراد آخر سنة (ج.م)": Math.round(income / 100),
  "مصروف آخر سنة (ج.م)": Math.round(expense / 100),
  "صافي آخر سنة (ج.م)": Math.round((income - expense) / 100),
  "علف آخر سنة (طن)": +(feedKg / 1000).toFixed(1),
  "لحم مباع آخر سنة (كجم)": Math.round(kgSold),
  "تحويل غذائي (كجم علف/كجم)": kgSold > 0 ? +(feedKg / kgSold).toFixed(2) : 0,
  "سعر التعادل (ج.م/كجم)": +(breakEven / 100).toFixed(2),
  "سعر البيع (ج.م/كجم)": kgSold > 0 ? +(saleCents / kgSold / 100).toFixed(2) : 0,
});
