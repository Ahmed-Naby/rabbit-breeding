import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/settings";
import { getHerdComposition } from "@/lib/herd-composition";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";
import { BreedsManager } from "./breeds-manager";
import { DangerZone } from "./danger-zone";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: `${t.settings.title} · RabbitTrack` };
}

export default async function SettingsPage() {
  const [settings, breeds, composition, { locale, t }] = await Promise.all([
    getSettings(),
    prisma.breed.findMany({ orderBy: { name: "asc" } }),
    // Read here rather than inside the form so the expected-feed figure is
    // costed against the herd that actually exists, not against a number the
    // user typed. It is the only thing on this page that isn't a setting.
    getHerdComposition(),
    getDictionary(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={t.settings.title} description={t.settings.description} />
      <SettingsForm
        key={JSON.stringify(settings)}
        settings={settings}
        composition={composition}
        locale={locale}
        t={t.settings}
      />
      <BreedsManager breeds={breeds} t={t.settings} />
      <DangerZone t={t.settings} />
    </div>
  );
}
