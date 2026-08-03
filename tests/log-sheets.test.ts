import { describe, expect, it } from "vitest";
import { buildLogSheet, logSheetFilename } from "@/lib/sheets/log-sheets";

/**
 * The column mapping, not the zip — tests/xlsx.test.ts covers the writer. What
 * breaks here is a shifted column or a value that goes out as the wrong type,
 * which a spreadsheet shows as a plausible-looking wrong number.
 */

describe("buildLogSheet", () => {
  it("keeps the mating columns in step with the row values", () => {
    const sheet = buildLogSheet(
      {
        kind: "mating",
        rows: [
          {
            doeTag: "0012",
            breed: "نيوزيلندي",
            buckTag: "7",
            matingDate: "2026-02-08T00:00:00.000Z",
            wasNursingAtMating: true,
          },
        ],
      },
      "ar"
    );

    expect(sheet.columns).toHaveLength(sheet.rows[0].length);
    expect(sheet.sheetName).toBe("سجل التلقيح");
    expect(sheet.rightToLeft).toBe(true);
    // Leading zeros survive: a tag number is a name, not a quantity.
    expect(sheet.rows[0][0]).toBe("0012");
    expect(sheet.rows[0][3]).toBeInstanceOf(Date);
  });

  it("exports an English sheet left-to-right", () => {
    const sheet = buildLogSheet({ kind: "mating", rows: [] }, "en");
    expect(sheet.rightToLeft).toBe(false);
    expect(sheet.sheetName).not.toBe("سجل التلقيح");
  });

  it("blanks a kindling's نافق on rows that predate the column", () => {
    const rows = [
      { kindlingDate: "2026-02-08", bornAlive: 8, bornDead: -1 },
      { kindlingDate: "2026-02-09", bornAlive: 7, bornDead: 0 },
      { kindlingDate: "2026-02-10", bornAlive: 6, bornDead: 2 },
    ].map((r) => ({ ...r, matingDate: null }));
    const sheet = buildLogSheet({ kind: "kindling", rows }, "ar");

    // null, not 0 — "not recorded" must not be summed as "no stillborns".
    expect(sheet.rows.map((r) => r[6])).toEqual([null, 0, 2]);
  });

  it("drops the kindling-date column when no row carries one", () => {
    const withDate = buildLogSheet(
      { kind: "nursingKitDeaths", rows: [{ date: "2026-02-08", doeTag: "3", kindlingDate: "2026-02-01", count: 2 }] },
      "ar"
    );
    const without = buildLogSheet(
      { kind: "nursingKitDeaths", rows: [{ date: "2026-02-08", doeTag: "3", count: 2 }] },
      "ar"
    );

    expect(withDate.columns).toHaveLength(4);
    expect(withDate.rows[0]).toHaveLength(4);
    expect(without.columns).toHaveLength(3);
    expect(without.rows[0]).toHaveLength(3);
    expect(without.rows[0][2]).toBe(2);
  });

  it("writes the weaning survival rate as whole percent", () => {
    const sheet = buildLogSheet(
      {
        kind: "weaning",
        rows: [
          {
            kindlingDate: null,
            weaningDate: "2026-02-08",
            alive: 8,
            dead: 2,
            weaned: 6,
            weaningWeightGrams: 620,
            survivalRate: 0.75,
          },
          {
            kindlingDate: null,
            weaningDate: "2026-02-09",
            alive: 8,
            dead: 0,
            weaned: null,
            weaningWeightGrams: null,
            survivalRate: null,
          },
        ],
      },
      "ar"
    );

    expect(sheet.rows[0][9]).toBe(75);
    expect(sheet.rows[1][9]).toBeNull();
  });

  it("translates a sex code rather than exporting the enum", () => {
    const sheet = buildLogSheet(
      { kind: "deceasedStock", rows: [{ date: "2026-02-08", sex: "doe", breed: null }] },
      "ar"
    );
    expect(sheet.rows[0][1]).toBe("أنثى");
  });

  it("keeps a doe's fertility rates as whole numbers and her gaps blank", () => {
    const sheet = buildLogSheet(
      {
        kind: "doesFertility",
        rows: [
          {
            tagId: "0012",
            breed: null,
            status: "active",
            doeState: "nursing",
            totalBreedings: 3,
            totalKindlings: 2,
            // Already a percentage on both bundles — not scaled again here.
            fertilityRate: 66.666,
            avgBornAtKindling: 7.5,
            avgBorn: 7,
            avgWeaned: null,
            avgWeaningWeight: 618.4,
            weaningSurvivalRate: null,
          },
        ],
      },
      "ar"
    );

    expect(sheet.columns).toHaveLength(sheet.rows[0].length);
    expect(sheet.sheetName).toBe("تقرير خصوبة الأمهات");
    expect(sheet.rows[0][2]).toBe("نشط");
    expect(sheet.rows[0][3]).toBe("مرضعة");
    expect(sheet.rows[0][6]).toBe(67);
    // Averages keep their decimals; the column, not the value, does the rounding.
    expect(sheet.rows[0][7]).toBe(7.5);
    expect(sheet.rows[0][9]).toBeNull();
    expect(sheet.rows[0][10]).toBe(618);
    expect(sheet.rows[0][11]).toBeNull();
  });

  it("keeps the buck fertility columns in step with the row values", () => {
    const sheet = buildLogSheet(
      {
        kind: "bucksFertility",
        rows: [
          {
            tagId: "7",
            breed: "نيوزيلندي",
            status: "active",
            totalBreedings: 4,
            totalPregnancies: 3,
            fertilityRate: 75,
            avgBorn: 8.25,
            totalBornAtKindling: 33,
          },
        ],
      },
      "ar"
    );

    expect(sheet.columns).toHaveLength(sheet.rows[0].length);
    expect(sheet.sheetName).toBe("تقرير خصوبة الذكور");
    expect(sheet.rows[0]).toEqual(["7", "نيوزيلندي", "نشط", 4, 3, 75, 8.25, 33]);
  });

  it("exports herd weights in the farm's own unit", () => {
    const row = {
      tagId: "0012",
      breed: "نيوزيلندي",
      acquiredDate: "2024-10-24T00:00:00.000Z",
      weightGrams: 4474,
      status: "active",
      doeState: "nursing",
    };

    const kg = buildLogSheet({ kind: "herdDoes", weightUnit: "kg", rows: [row] }, "ar");
    expect(kg.columns).toHaveLength(kg.rows[0].length);
    expect(kg.sheetName).toBe("الأمهات");
    expect(kg.columns[3].header).toBe("الوزن (كجم)");
    expect(kg.rows[0]).toEqual(["0012", "نيوزيلندي", new Date("2024-10-24T00:00:00.000Z"), 4.47, "نشط", "مرضعة"]);

    const lb = buildLogSheet({ kind: "herdDoes", weightUnit: "lb_oz", rows: [row] }, "ar");
    expect(lb.columns[3].header).toBe("الوزن (رطل)");
    expect(lb.rows[0][3]).toBe(9.86);
  });

  it("drops the doe-state column on the bucks roster", () => {
    const sheet = buildLogSheet(
      {
        kind: "herdBucks",
        weightUnit: "kg",
        rows: [
          {
            tagId: "7",
            breed: null,
            acquiredDate: "2025-01-12T00:00:00.000Z",
            weightGrams: null,
            status: "active",
          },
        ],
      },
      "ar"
    );

    expect(sheet.columns).toHaveLength(sheet.rows[0].length);
    expect(sheet.sheetName).toBe("الذكور");
    // Blank, not zero: an unweighed buck has no weight, he isn't weightless.
    expect(sheet.rows[0]).toEqual(["7", null, new Date("2025-01-12T00:00:00.000Z"), null, "نشط"]);
  });

  it("keeps the stock columns in step with the row values", () => {
    const sheet = buildLogSheet(
      {
        kind: "stock",
        rows: [
          {
            date: "2026-01-05T00:00:00.000Z",
            sex: "doe",
            breed: "بوسكات",
            cage: "0104",
            weightKg: 2.25,
          },
        ],
      },
      "ar"
    );

    expect(sheet.columns).toHaveLength(sheet.rows[0].length);
    expect(sheet.sheetName).toBe("السلالات");
    expect(sheet.rows[0]).toEqual([new Date("2026-01-05T00:00:00.000Z"), "أنثى", "بوسكات", "0104", 2.25]);
  });

  it("blanks the last-kindling date for a doe who never kindled", () => {
    const sheet = buildLogSheet(
      {
        kind: "idleDoes",
        rows: [
          {
            tagId: "24",
            breed: "كاليفورنيا",
            lastKindlingDate: "2025-10-29T00:00:00.000Z",
            neverKindled: false,
            idleDays: 277,
          },
          { tagId: "163", breed: null, lastKindlingDate: null, neverKindled: true, idleDays: 127 },
        ],
      },
      "ar"
    );

    expect(sheet.columns).toHaveLength(sheet.rows[0].length);
    expect(sheet.sheetName).toBe("الأمهات الخاملة");
    expect(sheet.rows[0]).toEqual(["24", "كاليفورنيا", new Date("2025-10-29T00:00:00.000Z"), 277]);
    // A date column stays a date — «لم تلد إطلاقًا» has no place in it.
    expect(sheet.rows[1]).toEqual(["163", null, null, 127]);
  });

  it("names the file after the sheet and the day", () => {
    const day = new Date().toISOString().slice(0, 10);
    expect(logSheetFilename("سجل التلقيح")).toBe(`rabbittrack-سجل-التلقيح-${day}.xlsx`);
  });
});
