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

export const metadata = { title: "Edit rabbit · RabbitTrack" };

export default async function EditRabbitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [rabbit, { buckOptions, doeOptions }, breedOptions] = await Promise.all([
    prisma.rabbit.findUnique({ where: { id } }),
    getParentOptions(id),
    getBreedOptions(),
  ]);
  if (!rabbit) notFound();

  const updateWithId = updateRabbit.bind(null, id);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit">
        <Link href={`/rabbits/${id}`}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> العودة إلى الأرنب
        </Link>
      </Button>
      <PageHeader
        title={rabbit.tagId ? `تعديل رقم ${rabbit.tagId}` : "تعديل سلالة بدون رقم"}
        description="تحديث بيانات هذا الأرنب."
      />
      <RabbitForm
        action={updateWithId}
        rabbit={rabbit}
        buckOptions={buckOptions}
        doeOptions={doeOptions}
        breedOptions={breedOptions}
        submitLabel="حفظ التغييرات"
      />
    </div>
  );
}
