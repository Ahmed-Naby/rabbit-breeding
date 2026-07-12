import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";
import { BreedsManager } from "./breeds-manager";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.settings.title} · RabbitTrack` };
}

export default async function SettingsPage() {
  const [settings, breeds, { locale, t }] = await Promise.all([
    getSettings(),
    prisma.breed.findMany({ orderBy: { name: "asc" } }),
    getDictionary(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={t.settings.title} description={t.settings.description} />
      <SettingsForm
        key={JSON.stringify(settings)}
        settings={settings}
        locale={locale}
        t={t.settings}
      />
      <BreedsManager breeds={breeds} t={t.settings} />
    </div>
  );
}
