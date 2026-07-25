import { HeartHandshake } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";
import type { FosterCandidate } from "@/lib/fostering";
import { LocalDate } from "@/components/local-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Mobile twin of src/app/fostering/foster-candidates.tsx — same two read-only
 * lists (donors / recipients), fed by the same lib/fostering split so the two
 * platforms show identical does.
 */
function CandidateList({
  candidates,
  title,
  description,
  emptyTitle,
  locale,
  t,
}: {
  candidates: FosterCandidate[];
  title: string;
  description: string;
  emptyTitle: string;
  locale: Locale;
  t: Dictionary["fostering"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="p-0">
        {candidates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <HeartHandshake className="h-8 w-8" />
            <p className="font-medium">{emptyTitle}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="[&>th]:border-x [&>th]:text-center">
                <TableHead>{t.colIndex}</TableHead>
                <TableHead>{t.colDoe}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.colCage}</TableHead>
                <TableHead>{t.colKindlingDate}</TableHead>
                <TableHead>{t.colKits}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c, i) => (
                <TableRow key={c.doeId} className="[&>td]:border-x [&>td]:text-center">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  {/* The doe number is what gets typed into the form below, so
                      it stays the loudest thing in the row — a farmer reading
                      fast must not grab the kit count by mistake. */}
                  <TableCell className="text-base font-bold">{c.tagId ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.cage ?? "—"}</TableCell>
                  <TableCell>
                    <LocalDate date={c.kindlingDate} locale={locale} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c.kits}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function FosterCandidates({
  large,
  small,
  windowDays,
  highKits,
  lowKits,
  locale,
  t,
}: {
  large: FosterCandidate[];
  small: FosterCandidate[];
  windowDays: number;
  highKits: number;
  lowKits: number;
  locale: Locale;
  t: Dictionary["fostering"];
}) {
  const fill = (template: string, kits: number) =>
    template.replace("{days}", String(windowDays)).replace("{n}", String(kits));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CandidateList
        candidates={large}
        title={t.highTitle}
        description={fill(t.highDescription, highKits)}
        emptyTitle={t.highEmpty}
        locale={locale}
        t={t}
      />
      <CandidateList
        candidates={small}
        title={t.lowTitle}
        description={fill(t.lowDescription, lowKits)}
        emptyTitle={t.lowEmpty}
        locale={locale}
        t={t}
      />
    </div>
  );
}
