import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";
import { BreedsManager } from "./breeds-manager";

export const metadata = { title: "Settings · RabbitTrack" };

export default async function SettingsPage() {
  const [settings, breeds] = await Promise.all([
    getSettings(),
    prisma.breed.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="الإعدادات"
        description="تفضيلات الوحدات والتزاوج والعملة لكامل المزرعة."
      />
      <SettingsForm key={JSON.stringify(settings)} settings={settings} />
      <BreedsManager breeds={breeds} />
    </div>
  );
}
