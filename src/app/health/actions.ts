"use server";

import { revalidatePath } from "next/cache";
import { createHealthRecordOp, type CreateHealthRecordInput } from "@/lib/rabbit-ops";

export async function createHealthRecord(input: CreateHealthRecordInput) {
  await createHealthRecordOp(input);

  revalidatePath("/health");
  revalidatePath("/rounds");
  revalidatePath("/bucks-rounds");
  revalidatePath(`/rabbits/${input.rabbitId}`);

  return { ok: true };
}
