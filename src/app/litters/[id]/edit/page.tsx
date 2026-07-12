import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { LitterForm } from "../../litter-form";
import { updateLitter } from "../../actions";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export const metadata = { title: "Edit litter · RabbitTrack" };

export default async function EditLitterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [litter, { locale, t }] = await Promise.all([
    prisma.litter.findUnique({ where: { id } }),
    getDictionary(),
  ]);
  if (!litter) notFound();

  const updateWithId = updateLitter.bind(null, id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/litters/${id}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t.litters.editPageBack}
        </Link>
      </Button>
      <PageHeader title={t.litters.editPageTitle} />
      <LitterForm action={updateWithId} litter={litter} locale={locale} />
    </div>
  );
}
