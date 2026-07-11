import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import { FosterForm } from "./foster-form";

export const metadata = { title: "التبني · RabbitTrack" };

export default async function FosteringPage() {
  const logs = await prisma.fosterLog.findMany({
    include: {
      fromDoe: { select: { id: true, tagId: true } },
      toDoe: { select: { id: true, tagId: true } },
    },
    orderBy: { date: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="عمليات التبني"
        description="نقل رضع من أم إلى أخرى لموازنة أعداد البطون."
      />

      <FosterForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل عمليات التبني</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={HeartHandshake}
                title="لا توجد عمليات تبني مسجلة"
                description="سجل نقل الرضع بين الأمهات باستخدام النموذج أعلاه."
              />
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Link href={`/rabbits/${log.fromDoe.id}`} className="hover:underline">
                      {log.fromDoe.tagId ?? "سلالة"}
                    </Link>
                    <span className="text-muted-foreground">→</span>
                    <Link href={`/rabbits/${log.toDoe.id}`} className="hover:underline">
                      {log.toDoe.tagId ?? "سلالة"}
                    </Link>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium tabular-nums">{log.count} رضيع</span>
                    <span className="text-xs text-muted-foreground">
                      <LocalDate date={log.date} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
