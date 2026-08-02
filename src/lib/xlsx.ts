import { zipSync, strToU8 } from "fflate";

/**
 * A minimal .xlsx writer — one sheet, one header row, plain cells.
 *
 * Hand-written rather than pulled from a library: an xlsx is a zip of six small
 * XML parts, and the two candidates both cost more than they're worth here.
 * exceljs is ~600 KB of node-shaped code riding into the APK, and the
 * maintained SheetJS is no longer published to npm — the `xlsx` package there
 * is the stale 2023 build with open advisories, which is not something to put
 * in a public repo for the sake of a download button.
 *
 * Everything runs in the browser, so exporting keeps working with no network:
 * on the phone the table being exported was read out of the local SQLite mirror
 * in the first place.
 */

export type XlsxValue = string | number | Date | null | undefined;

export type XlsxFormat =
  /** Left as typed. Tag numbers live here — "0012" must keep its zeros. */
  | "text"
  /** Whole numbers: counts, head, days. */
  | "number"
  /** Two decimals with thousands separators: money, kilograms. */
  | "decimal"
  /** yyyy-mm-dd, written as a real date so Excel can sort and filter on it. */
  | "date";

export type XlsxColumn = {
  header: string;
  /** Width in characters, as Excel counts them. Defaults to 14. */
  width?: number;
  format?: XlsxFormat;
};

/** Style indexes into the cellXfs list built in `stylesXml`. */
const STYLE = { general: 0, header: 1, date: 2, decimal: 3 } as const;

/**
 * Excel's day zero. 1899-12-30, not the 12-31 the format nominally starts from:
 * Excel keeps Lotus 1-2-3's belief that 1900 was a leap year, and this offset is
 * how every other implementation absorbs the missing day.
 */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * A date as an Excel serial, read in the sheet's own timezone-free terms: the
 * day the user saw in the app is the day Excel shows, whatever the machine
 * opening the file is set to.
 */
function toExcelSerial(date: Date): number {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return (local - EXCEL_EPOCH_MS) / DAY_MS;
}

function cellXml(ref: string, value: XlsxValue, format: XlsxFormat): string {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    return `<c r="${ref}" s="${STYLE.date}"><v>${toExcelSerial(value)}</v></c>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const style = format === "decimal" ? STYLE.decimal : STYLE.general;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }

  // Inline strings rather than a shared-strings table: the table would save
  // bytes on a sheet full of repeated words, and cost a second pass plus a
  // whole part to get wrong. These files are a few hundred rows.
  return `<c r="${ref}" s="${STYLE.general}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    String(value)
  )}</t></is></c>`;
}

function sheetXml(columns: XlsxColumn[], rows: XlsxValue[][], rightToLeft: boolean): string {
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`)
    .join("");

  const header = columns
    .map((c, i) => `<c r="${columnName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${escapeXml(c.header)}</t></is></c>`)
    .join("");

  const body = rows
    .map((row, r) => {
      const cells = columns
        .map((c, i) => cellXml(`${columnName(i)}${r + 2}`, row[i], c.format ?? "text"))
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  // freeze the header, and turn the sheet itself right-to-left for Arabic so
  // column A opens on the right, the way the table reads in the app.
  const pane = `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`;
  const lastColumn = columnName(Math.max(0, columns.length - 1));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"${rightToLeft ? ' rightToLeft="1"' : ""}>${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData><row r="1">${header}</row>${body}</sheetData>
<autoFilter ref="A1:${lastColumn}${rows.length + 1}"/>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8E8E8"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Excel refuses to open a workbook whose sheet name carries any of []:*?/\ or
 * runs past 31 characters, and it refuses without saying why — so the name is
 * cleaned here rather than trusted from a page title.
 */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

export function buildXlsx({
  sheetName,
  columns,
  rows,
  rightToLeft = false,
}: {
  sheetName: string;
  columns: XlsxColumn[];
  rows: XlsxValue[][];
  /** Arabic sheets open with column A on the right. */
  rightToLeft?: boolean;
}): Uint8Array {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
      "_rels/.rels": strToU8(ROOT_RELS_XML),
      "xl/workbook.xml": strToU8(workbookXml),
      "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS_XML),
      "xl/styles.xml": strToU8(STYLES_XML),
      "xl/worksheets/sheet1.xml": strToU8(sheetXml(columns, rows, rightToLeft)),
    },
    { level: 6 }
  );
}

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
