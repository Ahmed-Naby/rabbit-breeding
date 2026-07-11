import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { BreedingForm } from "../../breeding-form";
import { updateBreeding } from "../../actions";
import { getBreedingStock } from "../../data";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Edit mating · RabbitTrack" };

export default async function EditBreedingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [breeding, { buckOptions, doeOptions }, settings] = await Promise.all([
    prisma.breeding.findUnique({ where: { id } }),
    getBreedingStock(),
    getSettings(),
  ]);
  if (!breeding) notFound();

  const updateWithId = updateBreeding.bind(null, id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/breedings/${id}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> العودة إلى التلقيح
        </Link>
      </Button>
      <PageHeader title="تعديل التلقيح" />
      <BreedingForm
        action={updateWithId}
        breeding={breeding}
        buckOptions={buckOptions}
        doeOptions={doeOptions}
        gestationDays={settings.gestationDays}
        submitLabel="حفظ التغييرات"
      />
    </div>
  );
}
