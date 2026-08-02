import { describe, test, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx } from "@/lib/xlsx";

/**
 * The writer emits raw OOXML, so these tests are the only thing standing
 * between a malformed part and Excel's "we found a problem with some content"
 * dialog — which names no part and no line.
 */
function parts(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
}

const columns = [
  { header: "التاريخ", format: "date" as const },
  { header: "رقم الأم", format: "text" as const },
  { header: "العدد", format: "number" as const },
  { header: "الإجمالي", format: "decimal" as const },
];

describe("buildXlsx", () => {
  test("writes every part a workbook needs to open", () => {
    const files = parts(buildXlsx({ sheetName: "الفطام والبيع", columns, rows: [] }));
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  test("puts the headers in row 1 and the data from row 2", () => {
    const files = parts(
      buildXlsx({
        sheetName: "Sheet",
        columns,
        rows: [[new Date(2026, 1, 8), "0012", 5, 1688.5]],
      })
    );
    const sheet = files["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("<t>التاريخ</t>");
    expect(sheet).toContain('<row r="2">');
    expect(sheet).toContain('<c r="C2" s="0"><v>5</v></c>');
    expect(sheet).toContain('<c r="D2" s="3"><v>1688.5</v></c>');
  });

  test("keeps a tag number a string so its leading zeros survive", () => {
    const sheet = parts(
      buildXlsx({ sheetName: "S", columns, rows: [[null, "0012", null, null]] })
    )["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">0012</t>');
  });

  test("writes a date as the serial Excel reads, in the day the user saw", () => {
    // 2026-02-08 is 46_061 days after 1899-12-30. Written from the local
    // calendar date, so a machine in another timezone still shows 08/02.
    const sheet = parts(
      buildXlsx({ sheetName: "S", columns, rows: [[new Date(2026, 1, 8), null, null, null]] })
    )["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="A2" s="2"><v>46061</v></c>');
  });

  test("omits empty cells rather than writing blanks", () => {
    const sheet = parts(
      buildXlsx({ sheetName: "S", columns, rows: [[null, "", undefined, 0]] })
    )["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<row r="2"><c r="D2"');
    expect(sheet).not.toContain('r="A2"');
    // 0 is a value, not an absence.
    expect(sheet).toContain('<c r="D2" s="3"><v>0</v></c>');
  });

  test("escapes the characters that would end the XML early", () => {
    const sheet = parts(
      buildXlsx({
        sheetName: "S",
        columns,
        rows: [[null, 'ذكر <b> & "خليط"', null, null]],
      })
    )["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain("ذكر &lt;b&gt; &amp; &quot;خليط&quot;");
  });

  test("cleans a sheet name Excel would refuse to open", () => {
    const workbook = parts(
      buildXlsx({ sheetName: "التقارير: 2026/02 [كل السجل]", columns, rows: [] })
    )["xl/workbook.xml"];
    expect(workbook).toContain('name="التقارير  2026 02  كل السجل"');
  });

  test("truncates a sheet name past Excel's 31-character limit", () => {
    const workbook = parts(
      buildXlsx({ sheetName: "x".repeat(40), columns, rows: [] })
    )["xl/workbook.xml"];
    expect(workbook).toContain(`name="${"x".repeat(31)}"`);
  });

  test("turns the sheet right-to-left only when asked", () => {
    const rtl = parts(buildXlsx({ sheetName: "S", columns, rows: [], rightToLeft: true }));
    expect(rtl["xl/worksheets/sheet1.xml"]).toContain('rightToLeft="1"');
    const ltr = parts(buildXlsx({ sheetName: "S", columns, rows: [] }));
    expect(ltr["xl/worksheets/sheet1.xml"]).not.toContain("rightToLeft");
  });

  test("names columns past Z the way Excel does", () => {
    const many = Array.from({ length: 28 }, (_, i) => ({ header: `c${i}` }));
    const sheet = parts(
      buildXlsx({ sheetName: "S", columns: many, rows: [Array.from({ length: 28 }, () => "x")] })
    )["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('r="Z2"');
    expect(sheet).toContain('r="AA2"');
    expect(sheet).toContain('r="AB2"');
  });
});
