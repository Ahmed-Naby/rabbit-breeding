"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { MarkDeceasedButton } from "./mortality-actions";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

export type MortalityStockOption = {
  id: string;
  sex: string;
  breed: string | null;
  cage: string | null;
};

/**
 * "نافق السلالات" entry. Untagged stock has no number of its own, so the cage
 * is the handle the farmer has — and a cage routinely holds several rabbits of
 * different breeds, so unlike the doe/buck forms this can't resolve to a single
 * match. Typing a cage number filters the herd down to just that cage and lists
 * its occupants with their own record-death button each.
 */
export function StockDeathForm({
  stock,
  locale,
}: {
  stock: MortalityStockOption[];
  locale: Locale;
}) {
  const t = getClientDictionary(locale).mortality;
  const [cage, setCage] = useState("");

  const query = cage.trim();
  const matches = useMemo(
    () => (query ? stock.filter((r) => (r.cage ?? "").trim() === query) : []),
    [stock, query],
  );
  const notFound = query.length > 0 && matches.length === 0;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="space-y-1.5 sm:max-w-xs">
          <label className="text-sm font-semibold" htmlFor="stock-death-cage">
            {t.colCage}
          </label>
          <Input
            id="stock-death-cage"
            inputMode="numeric"
            autoComplete="off"
            value={cage}
            placeholder={t.cagePlaceholder}
            onChange={(e) => setCage(e.target.value)}
          />
        </div>

        {matches.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr className="[&>th]:border-x">
                  <th className="w-16 px-4 py-3 text-center">{t.colIndex}</th>
                  <th className="px-4 py-3 text-center">{t.colSex}</th>
                  <th className="px-4 py-3 text-center">{t.colStrainBreed}</th>
                  <th className="w-36 px-4 py-3 text-center">{t.colRecordDeceased}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {matches.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/40 [&>td]:border-x [&>td]:text-center">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={r.sex} locale={locale} />
                    </td>
                    <td className="px-4 py-3">{r.breed ?? "—"}</td>
                    <td className="px-4 py-3">
                      <MarkDeceasedButton
                        id={r.id}
                        confirmText={t.strainDeathConfirm}
                        locale={locale}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : notFound ? (
          <p className="text-sm font-medium text-destructive">{t.cageNotFound}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.strainsFormHint}</p>
        )}
      </CardContent>
    </Card>
  );
}
