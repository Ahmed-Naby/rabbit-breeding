import { prisma } from "@/lib/prisma";
import { toGrams } from "@/lib/units";
import { RABBIT_STATUSES, type RabbitStatus, DOE_STATES, type DoeState } from "@/lib/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Rabbit } from "@/generated/prisma/client";
import type { OpResult } from "@/lib/op-result";

export type RabbitData = {
  tagId: string;
  breed: string | null;
  color: string | null;
  sex: string;
  status: string;
  cage: string | null;
  dateOfBirth: Date | null;
  acquiredDate: Date | null;
  acquiredFrom: string | null;
  sireId: string | null;
  damId: string | null;
  notes: string | null;
  photoUrl: string | null;
  litterId: string | null;
};

export async function createRabbitOp(
  data: RabbitData,
  opts?: { id?: string }
): Promise<OpResult<Rabbit, "TAG_IN_USE">> {
  try {
    // Only reachable via /rabbits/new?litterId=... (promoting a kit from a
    // recorded breeding) — always farm origin, see NewRabbitPage's redirect.
    const rabbit = await prisma.rabbit.create({
      data: { id: opts?.id, ...data, origin: "farm" },
    });
    return { ok: true, data: rabbit };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }
}

export type CreateQuickRabbitInput = {
  tagId: string | null;
  breed: string | null;
  sex: "doe" | "buck";
  date: Date;
  weightKg: number | null;
  origin?: "farm" | "external";
};

/**
 * Fast intake: one row (sex, date, breed, optionally tag + weight) instead of
 * the full form. Sex is a field on the row itself now (the unified /stock
 * table covers both does and bucks) — tag numbers are still independent per
 * sex (@@unique([tagId, sex])), so the same number can exist once per sex.
 * Leaving tagId/weightKg blank registers the rabbit as a juvenile (sex known
 * but not yet promoted); assigning its tag later via finalizeQuickRabbit is
 * what promotes it.
 */
export async function createQuickRabbitOp(
  data: CreateQuickRabbitInput,
  opts?: { id?: string }
): Promise<OpResult<Rabbit, "TAG_IN_USE">> {
  let rabbit: Rabbit;
  const origin = data.origin ?? "farm";
  try {
    rabbit = await prisma.$transaction(async (tx) => {
      const rabbit = await tx.rabbit.create({
        data: {
          id: opts?.id,
          tagId: data.tagId,
          breed: data.breed,
          sex: data.sex,
          acquiredDate: data.date,
          origin,
        },
      });
      // Registering a farm-retained سلالة removes a weaned kit from the
      // available weaning-sales pool. External/purchased stock does NOT deduct.
      if (origin !== "external") {
        await tx.kitStockMovement.create({
          data: { date: data.date, type: "retained", count: 1, rabbitId: rabbit.id },
        });
      }
      return rabbit;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }

  if (data.weightKg != null) {
    const grams = toGrams({ kg: data.weightKg }, "kg");
    await prisma.weightRecord.create({
      data: { rabbitId: rabbit.id, date: data.date, weightGrams: grams },
    });
  }

  return { ok: true, data: rabbit };
}

export type CreateMotherInput = {
  tagId: string;
  breed: string | null;
  weightKg: number | null;
};

/**
 * Quick-add on /mothers: creates a doe straight into the herd with its tag
 * assigned immediately (sex: doe, status: active, doeState: empty) — unlike
 * createQuickRabbit's tagId-less juvenile intake, this row belongs on the
 * mothers table right away, not the /stock promotion queue. Bypassing /stock
 * means she was never registered as a juvenile first, so this is always an
 * externally-acquired rabbit — origin: "external".
 */
export async function createMotherOp(
  data: CreateMotherInput,
  opts?: { id?: string }
): Promise<OpResult<Rabbit, "TAG_IN_USE">> {
  let rabbit: Rabbit;
  try {
    rabbit = await prisma.rabbit.create({
      data: {
        id: opts?.id,
        tagId: data.tagId,
        breed: data.breed,
        sex: "doe",
        status: "active",
        doeState: "empty",
        acquiredDate: new Date(),
        origin: "external",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }

  if (data.weightKg != null) {
    const grams = toGrams({ kg: data.weightKg }, "kg");
    await prisma.weightRecord.create({
      data: { rabbitId: rabbit.id, date: new Date(), weightGrams: grams },
    });
  }

  return { ok: true, data: rabbit };
}

export type CreateBuckInput = {
  tagId: string;
  breed: string | null;
  weightKg: number | null;
};

/**
 * Quick-add on /bucks — mirrors createMother for the buck side of the herd:
 * creates a buck straight in with its tag assigned immediately (sex: buck,
 * status: active), skipping the /stock promotion queue — origin: "external",
 * same reasoning as createMother.
 */
export async function createBuckOp(
  data: CreateBuckInput,
  opts?: { id?: string }
): Promise<OpResult<Rabbit, "TAG_IN_USE">> {
  let rabbit: Rabbit;
  try {
    rabbit = await prisma.rabbit.create({
      data: {
        id: opts?.id,
        tagId: data.tagId,
        breed: data.breed,
        sex: "buck",
        status: "active",
        acquiredDate: new Date(),
        origin: "external",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }

  if (data.weightKg != null) {
    const grams = toGrams({ kg: data.weightKg }, "kg");
    await prisma.weightRecord.create({
      data: { rabbitId: rabbit.id, date: new Date(), weightGrams: grams },
    });
  }

  return { ok: true, data: rabbit };
}

/**
 * Records a juvenile's cage number while it's still raised in the /stock
 * nursery pen — does NOT move it off that page; only the explicit "move to
 * herd" button does that (see promoteToHerdPen).
 */
export async function saveQuickRabbitCageOp(id: string, cage: string): Promise<Rabbit> {
  return prisma.rabbit.update({
    where: { id },
    data: { cage },
  });
}

/**
 * Weight side of the same autosave-on-blur intake step (see
 * saveQuickRabbitCage) — independent of the cage save, so either can be
 * entered first. Updates the latest WeightRecord in place rather than
 * creating a new one on every blur, since re-editing before the row leaves
 * /stock is fixing the same intake weighing, not a fresh measurement.
 */
export async function saveQuickRabbitWeightOp(id: string, weightKg: number): Promise<void> {
  const grams = toGrams({ kg: weightKg }, "kg");
  const latest = await prisma.weightRecord.findFirst({
    where: { rabbitId: id },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.weightRecord.update({
      where: { id: latest.id },
      data: { weightGrams: grams },
    });
  } else {
    await prisma.weightRecord.create({
      data: { rabbitId: id, date: new Date(), weightGrams: grams },
    });
  }
}

/**
 * The only thing that moves a juvenile off /stock: an explicit click, never
 * automatic just because cage/weight got filled in — it may sit in the
 * nursery pen for months first. Requires both to already be recorded (via
 * saveQuickRabbitCage / saveQuickRabbitWeight) before allowing the move.
 */
export async function promoteToHerdPenOp(
  id: string
): Promise<OpResult<void, "NOT_FOUND" | "CAGE_REQUIRED" | "WEIGHT_REQUIRED">> {
  const rabbit = await prisma.rabbit.findUnique({
    where: { id },
    select: {
      cage: true,
      weightRecords: { take: 1, select: { id: true } },
    },
  });
  if (!rabbit) return { ok: false, code: "NOT_FOUND" };
  if (!rabbit.cage) return { ok: false, code: "CAGE_REQUIRED" };
  if (rabbit.weightRecords.length === 0) {
    return { ok: false, code: "WEIGHT_REQUIRED" };
  }

  await prisma.rabbit.update({
    where: { id },
    data: { movedToHerdPen: true },
  });

  return { ok: true, data: undefined };
}

/**
 * Second step of a doe's two-stage intake: assigns her tagId, completing the
 * promotion started by finalizeQuickRabbit on /stock (which only assigned
 * her cage + weight). Also lets her weight be corrected here — updates the
 * latest WeightRecord in place rather than adding a new one, since this is
 * fixing/confirming the same intake weighing, not a fresh measurement.
 * acquiredDate is bumped to today here too — it's shown as "joined herd",
 * so it should reflect this promotion, not the original /stock intake date.
 */
export async function finalizeMotherOp(
  id: string,
  tagId: string,
  weightKg: number
): Promise<OpResult<void, "TAG_IN_USE">> {
  try {
    await prisma.rabbit.update({
      where: { id },
      data: { tagId, acquiredDate: new Date() },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }

  const grams = toGrams({ kg: weightKg }, "kg");
  const latest = await prisma.weightRecord.findFirst({
    where: { rabbitId: id },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.weightRecord.update({
      where: { id: latest.id },
      data: { weightGrams: grams },
    });
  } else {
    await prisma.weightRecord.create({
      data: { rabbitId: id, date: new Date(), weightGrams: grams },
    });
  }

  return { ok: true, data: undefined };
}

/**
 * Second step of a buck's two-stage intake: assigns his tagId, mirroring
 * finalizeMother for the buck side, including the same
 * update-latest-weight-record-in-place and acquiredDate-bump behavior.
 */
export async function finalizeBuckOp(
  id: string,
  tagId: string,
  weightKg: number
): Promise<OpResult<void, "TAG_IN_USE">> {
  try {
    await prisma.rabbit.update({
      where: { id },
      data: { tagId, acquiredDate: new Date() },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }

  const grams = toGrams({ kg: weightKg }, "kg");
  const latest = await prisma.weightRecord.findFirst({
    where: { rabbitId: id },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.weightRecord.update({
      where: { id: latest.id },
      data: { weightGrams: grams },
    });
  } else {
    await prisma.weightRecord.create({
      data: { rabbitId: id, date: new Date(), weightGrams: grams },
    });
  }

  return { ok: true, data: undefined };
}

export async function updateRabbitOp(
  id: string,
  data: RabbitData
): Promise<OpResult<Rabbit, "TAG_IN_USE" | "SELF_PARENT">> {
  // Guard: a rabbit can't be its own parent.
  if (data.sireId === id || data.damId === id) {
    return { ok: false, code: "SELF_PARENT" };
  }

  try {
    const rabbit = await prisma.rabbit.update({ where: { id }, data });
    return { ok: true, data: rabbit };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }
}

/**
 * Hard delete — removes the rabbit and its weight/health records entirely.
 * Blocked at the DB level (Breeding.buck/doe use onDelete: Restrict) if the
 * rabbit has any breeding history, to protect pedigree data; use the status
 * menu (excluded/deceased) for that case instead. Sire/dam refs on other
 * rabbits are SetNull'd automatically, so this never orphans a pedigree FK.
 */
export async function deleteRabbitOp(id: string): Promise<OpResult<void, "DELETE_BLOCKED_BY_BREEDING">> {
  try {
    await prisma.$transaction([
      prisma.rabbit.delete({ where: { id } }),
      prisma.syncTombstone.create({ data: { model: "rabbit", recordId: id } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, code: "DELETE_BLOCKED_BY_BREEDING" };
    }
    throw e;
  }
  return { ok: true, data: undefined };
}

/**
 * Soft-delete / lifecycle change. Never hard-deletes (preserves pedigree).
 *
 * Marking a tagged rabbit "deceased" or "culled" also retires her tagId:
 * it's copied (with today's date and a status-specific word) into
 * retiredTagId for display, then cleared to null. @@unique([tagId, sex])
 * treats NULL as non-conflicting, so her old number becomes immediately
 * assignable to a new rabbit of the same sex — the pedigree/breeding-history
 * row itself is untouched, only the number moves.
 */
const TAG_RETIRING_STATUSES: Partial<Record<RabbitStatus, string>> = {
  deceased: "نافق",
  culled: "استبعاد",
};

export async function setRabbitStatusOp(id: string, status: string): Promise<Rabbit> {
  if (!RABBIT_STATUSES.includes(status as RabbitStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const retireWord = TAG_RETIRING_STATUSES[status as RabbitStatus];
  if (retireWord) {
    const current = await prisma.rabbit.findUnique({ where: { id }, select: { tagId: true } });
    if (current?.tagId) {
      const today = new Date().toISOString().slice(0, 10);
      return prisma.rabbit.update({
        where: { id },
        data: {
          status: status as RabbitStatus,
          tagId: null,
          retiredTagId: `${current.tagId} (${retireWord} ${today})`,
        },
      });
    }
  }
  return prisma.rabbit.update({
    where: { id },
    data: { status: status as RabbitStatus },
  });
}

/**
 * Manual doe reproductive state, set exclusively via the six action buttons
 * on the does page (mate/pregnant/negative/kindle/wean/exclude).
 */
export async function setDoeStateOp(id: string, state: string): Promise<Rabbit> {
  if (!DOE_STATES.includes(state as DoeState)) {
    throw new Error(`Invalid doe state: ${state}`);
  }
  return prisma.rabbit.update({
    where: { id },
    data: { doeState: state as DoeState },
  });
}

export type CreateHealthRecordInput = {
  rabbitId: string;
  date: Date;
  type: string;
  description: string;
  nextDueDate: Date | null;
};

/** Logs a health event (illness/treatment/vaccination/deworming/checkup) against a rabbit. */
export async function createHealthRecordOp(data: CreateHealthRecordInput) {
  return prisma.healthRecord.create({ data });
}

export type RabbitDetailsPatch = {
  // Optional, and deliberately distinguished from null: absent means "leave
  // the tag alone" (the detail form only submits it for herd rabbits), null
  // means "clear it". Prisma treats an undefined field as a no-op, so both
  // cases fall straight out of passing this to update().
  tagId?: string | null;
  breed: string | null;
  color: string | null;
  cage: string | null;
  dateOfBirth: Date | null;
  acquiredDate: Date | null;
  acquiredFrom: string | null;
  notes: string | null;
};

/**
 * Scoped-down edit for the offline app's rabbit detail page — the fields
 * that don't touch pedigree/state (sex, status, sireId/damId, photoUrl stay
 * out of scope offline).
 *
 * tagId IS in scope: the detail page lets a herd rabbit be renumbered, and
 * the local mirror applies that optimistically. Omitting it here meant the
 * server silently kept the old number and the very next pull overwrote the
 * rename back — an edit that looked saved, then reverted "on its own".
 * Renumbering can collide with @@unique([farmId, tagId, sex]), so this
 * reports TAG_IN_USE as an OpResult rather than throwing, matching both the
 * other tag-assigning ops here and the local apply's own rejection code.
 */
export async function updateRabbitDetailsOp(
  id: string,
  data: RabbitDetailsPatch
): Promise<OpResult<Rabbit, "TAG_IN_USE">> {
  try {
    return { ok: true, data: await prisma.rabbit.update({ where: { id }, data }) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, code: "TAG_IN_USE" };
    }
    throw e;
  }
}
