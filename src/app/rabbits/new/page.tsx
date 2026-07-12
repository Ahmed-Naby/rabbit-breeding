import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RabbitForm, type RabbitValues } from "../rabbit-form";
import { createRabbit } from "../actions";
import { getParentOptions } from "../data";
import { getBreedOptions } from "@/lib/breeds";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { Locale } from "@/lib/i18n/locales";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.rabbits.newPageTitle} · RabbitTrack` };
}

export default async function NewRabbitPage({
  searchParams,
}: {
  searchParams: Promise<{ litterId?: string }>;
}) {
  const { litterId } = await searchParams;
  const { locale, t } = await getDictionary();

  // Registering a new tagId-less "سلالة" happens on the dedicated /stock
  // page now; this route is only for promoting a specific litter's kit
  // straight into a full record (parents/DOB/breed are already known).
  if (!litterId) redirect("/stock");

  // Prefill parents/DOB/breed from the litter's breeding. Parentage FK
  // remains authoritative and editable.
  let prefill: RabbitValues | undefined;
  const litter = await prisma.litter.findUnique({
    where: { id: litterId },
    include: {
      breeding: {
        include: {
          buck: { select: { id: true, breed: true } },
          doe: { select: { id: true, breed: true } },
        },
      },
    },
  });
  if (litter) {
    prefill = {
      tagId: "",
      breed: litter.breeding.doe.breed ?? litter.breeding.buck?.breed ?? null,
      color: null,
      sex: "unknown",
      status: "active",
      cage: null,
      dateOfBirth: litter.kindlingDate,
      acquiredDate: null,
      acquiredFrom: null,
      sireId: litter.breeding.buckId,
      damId: litter.breeding.doeId,
      notes: null,
      photoUrl: null,
    };
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/litters/${litterId}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t.rabbits.newPageBack}
        </Link>
      </Button>
      <PageHeader
        title={t.rabbits.newPageTitle}
        description={t.rabbits.newPageDescription}
      />
      <RabbitFormWithOptions rabbit={prefill} hiddenLitterId={litterId} locale={locale} t={t} />
    </div>
  );
}

async function RabbitFormWithOptions({
  rabbit,
  hiddenLitterId,
  locale,
  t,
}: {
  rabbit?: RabbitValues;
  hiddenLitterId?: string;
  locale: Locale;
  t: Dictionary;
}) {
  const [{ buckOptions, doeOptions }, breedOptions] = await Promise.all([
    getParentOptions(),
    getBreedOptions(),
  ]);
  return (
    <RabbitForm
      action={createRabbit}
      rabbit={rabbit}
      hiddenLitterId={hiddenLitterId}
      buckOptions={buckOptions}
      doeOptions={doeOptions}
      breedOptions={breedOptions}
      submitLabel={t.rabbits.createButton}
      tCommon={t.common}
      locale={locale}
    />
  );
}
