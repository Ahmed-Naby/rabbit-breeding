import { describe, it, expect } from "vitest";
import { metricKeys, parseRecommendations } from "@/lib/insights/recommendations";

/** A stand-in summary with the same shape as the real one, three levels deep. */
const SUMMARY = {
  windowDays: 90,
  herd: { does: 63, bucks: 9 },
  productivity: { marginPerKg: -4.5, feedConversionRatio: 6.1 },
  weakDoes: [{ tagId: "12", score: 31 }],
};

function reply(items: unknown[], headline = "المزرعة تبيع تحت التعادل"): string {
  return JSON.stringify({ headline, recommendations: items });
}

const GOOD = {
  title: "كل كيلو مباع يخسر",
  detail: "الهامش سالب",
  action: "راجع سعر البيع",
  priority: "high",
  metrics: ["productivity.marginPerKg"],
};

describe("metricKeys — what a recommendation may cite", () => {
  it("walks nested objects into dotted paths", () => {
    const keys = metricKeys(SUMMARY);
    expect(keys.has("herd")).toBe(true);
    expect(keys.has("herd.does")).toBe(true);
    expect(keys.has("productivity.feedConversionRatio")).toBe(true);
  });

  it("stops at an array rather than indexing into it", () => {
    // A citation of "weakDoes[0].score" would point at a different doe the
    // next time the report runs — the list is the stable thing, not the row.
    const keys = metricKeys(SUMMARY);
    expect(keys.has("weakDoes")).toBe(true);
    expect(keys.has("weakDoes.0.score")).toBe(false);
  });

  it("has nothing to offer for a non-object", () => {
    expect(metricKeys(null).size).toBe(0);
    expect(metricKeys("herd").size).toBe(0);
  });
});

describe("parseRecommendations — the citation gate", () => {
  it("accepts an item that cites a real metric", () => {
    const out = parseRecommendations(reply([GOOD]), SUMMARY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0].title).toBe(GOOD.title);
    expect(out.droppedCount).toBe(0);
  });

  it("throws away an item citing a metric the farm never measured", () => {
    // The whole point: an invented figure arrives wearing a plausible name.
    const invented = { ...GOOD, metrics: ["productivity.profitPerRabbit"] };
    const out = parseRecommendations(reply([GOOD, invented]), SUMMARY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recommendations).toHaveLength(1);
    expect(out.droppedCount).toBe(1);
  });

  it("drops the item when only one of its citations is invented", () => {
    const half = { ...GOOD, metrics: ["herd.does", "herd.rabbitsPerCage"] };
    const out = parseRecommendations(reply([half]), SUMMARY);
    expect(out).toEqual({ ok: false, code: "NO_VALID_RECOMMENDATIONS" });
  });

  it("refuses an item with no citation at all", () => {
    const uncited = { ...GOOD, metrics: [] };
    expect(parseRecommendations(reply([uncited]), SUMMARY)).toEqual({
      ok: false,
      code: "NO_VALID_RECOMMENDATIONS",
    });
  });

  it("reads a reply wrapped in a code fence", () => {
    const fenced = "إليك التحليل:\n```json\n" + reply([GOOD]) + "\n```\n";
    expect(parseRecommendations(fenced, SUMMARY).ok).toBe(true);
  });

  it("reads a bare object with prose in front of it", () => {
    expect(parseRecommendations("تفضّل:\n" + reply([GOOD]), SUMMARY).ok).toBe(true);
  });

  it("names what was wrong when there is no JSON at all", () => {
    expect(parseRecommendations("لا أستطيع التحليل.", SUMMARY)).toEqual({
      ok: false,
      code: "NOT_JSON",
    });
  });

  it("refuses a reply with no headline", () => {
    const out = parseRecommendations(
      JSON.stringify({ recommendations: [GOOD] }),
      SUMMARY
    );
    expect(out).toEqual({ ok: false, code: "NO_HEADLINE" });
  });

  it("refuses a reply with an empty list", () => {
    expect(parseRecommendations(reply([]), SUMMARY)).toEqual({
      ok: false,
      code: "NO_RECOMMENDATIONS",
    });
  });

  it("drops an item missing its action rather than printing half of one", () => {
    const { action: _action, ...noAction } = GOOD;
    expect(parseRecommendations(reply([noAction]), SUMMARY)).toEqual({
      ok: false,
      code: "NO_VALID_RECOMMENDATIONS",
    });
  });

  it("keeps a good item whose priority is nonsense, at medium", () => {
    // A bad enum is not worth losing a finding over — an uncited number is.
    const odd = { ...GOOD, priority: "urgent" };
    const out = parseRecommendations(reply([odd]), SUMMARY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recommendations[0].priority).toBe("medium");
  });

  it("puts the expensive findings at the top of the list", () => {
    const low = { ...GOOD, title: "منخفضة", priority: "low" };
    const high = { ...GOOD, title: "عالية", priority: "high" };
    const mid = { ...GOOD, title: "متوسطة", priority: "medium" };
    const out = parseRecommendations(reply([low, mid, high]), SUMMARY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recommendations.map((r) => r.title)).toEqual(["عالية", "متوسطة", "منخفضة"]);
  });

  it("caps a runaway list at eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...GOOD, title: `توصية ${i}` }));
    const out = parseRecommendations(reply(many), SUMMARY);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recommendations).toHaveLength(8);
  });
});
