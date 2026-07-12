import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RabbitForm } from "../../rabbit-form";
import { updateRabbit } from "../../actions";
import { getParentOptions } from "../../data";
import { getBreedOptions } from "@/lib/breeds";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.rabbits.editPageBack} · RabbitTrack` };
}

export default async function EditRabbitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [rabbit, { buckOptions, doeOptions }, breedOptions, { locale, t }] = await Promise.all([
    prisma.rabbit.findUnique({ where: { id } }),
    getParentOptions(id),
    getBreedOptions(),
    getDictionary(),
  ]);
  if (!rabbit) notFound();

  const updateWithId = updateRabbit.bind(null, id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/rabbits/${id}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t.rabbits.editPageBack}
        </Link>
      </Button>
      <PageHeader
        title={
          rabbit.tagId
            ? t.rabbits.editPageTitleTagged(rabbit.tagId)
            : t.rabbits.editPageTitleUntagged
        }
        description={t.rabbits.editPageDescription}
      />
      <RabbitForm
        action={updateWithId}
        rabbit={rabbit}
        buckOptions={buckOptions}
        doeOptions={doeOptions}
        breedOptions={breedOptions}
        submitLabel={t.rabbits.saveChangesButton}
        tCommon={t.common}
        locale={locale}
      />
    </div>
  );
}
