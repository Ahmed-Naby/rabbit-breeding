"use server";

import { prisma } from "@/lib/prisma";

export type RabbitSearchResult = {
  id: string;
  tagId: string | null;
  retiredTagId: string | null;
  breed: string | null;
  cage: string | null;
  sex: string;
};

/** Header search box: find a rabbit by tag number, cage, or breed. */
export async function searchRabbits(query: string): Promise<RabbitSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  return prisma.rabbit.findMany({
    where: {
      OR: [
        { tagId: { contains: q, mode: "insensitive" } },
        { retiredTagId: { contains: q, mode: "insensitive" } },
        { cage: { contains: q, mode: "insensitive" } },
        { breed: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, tagId: true, retiredTagId: true, breed: true, cage: true, sex: true },
    orderBy: { tagId: "asc" },
    take: 8,
  });
}
