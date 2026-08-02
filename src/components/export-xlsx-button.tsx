"use client";

import { useState } from "react";
import { Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadInBrowser, type FileSaver } from "@/lib/download-file";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import type { LogSheetSpec } from "@/lib/sheets/log-sheets";

/**
 * «تصدير Excel» for any of the app's tables.
 *
 * Takes the rows already on screen, filter and all: what you exported is what
 * you were looking at. The workbook is built here in the browser rather than on
 * a route, so the button works on a phone with no signal — the rows it exports
 * came out of the local SQLite mirror in the first place.
 *
 * `spec` is data, not a callback, so a server component can pass it straight
 * down; the writer and the column mapping are both pulled in on click.
 */
export function ExportXlsxButton({
  spec,
  locale,
  save = downloadInBrowser,
  className,
}: {
  spec: LogSheetSpec;
  locale: Locale;
  /** Android needs the share sheet; everything else takes a Blob download. */
  save?: FileSaver;
  className?: string;
}) {
  const t = getClientDictionary(locale).common;
  const [busy, setBusy] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={busy || spec.rows.length === 0}
      onClick={async () => {
        setBusy(true);
        try {
          // Loaded on click: the zip writer is dead weight in the initial
          // bundle of a page most visits never export from.
          const [{ buildXlsx, XLSX_MIME }, { buildLogSheet, logSheetFilename }] = await Promise.all([
            import("@/lib/xlsx"),
            import("@/lib/sheets/log-sheets"),
          ]);
          const sheet = buildLogSheet(spec, locale);
          await save(buildXlsx(sheet), logSheetFilename(sheet.sheetName), XLSX_MIME);
        } catch (error) {
          console.error(error);
          toast.error(t.exportFailed);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Sheet className="size-4" />
      {busy ? t.exporting : t.exportExcel}
    </Button>
  );
}
