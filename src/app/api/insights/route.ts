import { authenticateSync } from "../sync/auth";
import { runWithFarm } from "@/lib/tenant";
import { buildFarmSummary, INSIGHTS_WINDOW_DAYS } from "@/lib/insights/summary";
import { buildInsightsPrompt, INSIGHTS_SYSTEM_PROMPT } from "@/lib/insights/prompt";
import { parseRecommendations, type InsightsResult } from "@/lib/insights/recommendations";
import { callModel, resolveProvider } from "@/lib/insights/provider";

/**
 * «تحليل ذكي للأداء» — the farm's own numbers, read back as advice.
 *
 * Server-side and nowhere else, for one hard reason: the repository is public
 * and the mobile bundle ships to phones, so an API key reachable from either
 * is a key already leaked. The device sends nothing but its existing sync
 * credentials; the summary is assembled here from the farm this request is
 * actually a member of, and the key never leaves the deployment.
 *
 * It reuses authenticateSync rather than the web cookie session so the same
 * route serves the phone (Bearer + x-farm-id) and any legacy shared-secret
 * device, exactly like /api/sync/* — one auth path, one tenant resolution.
 */

/** The model needs ~20–40s on a real farm; the Vercel default would cut it off. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authenticateSync(request);
  if (auth instanceof Response) return auth;

  const provider = resolveProvider();
  if (!provider) {
    // 503, not 500: nothing is broken, the feature simply has no key yet.
    return Response.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const summary = await runWithFarm(auth.farmId, () => buildFarmSummary());

  const reply = await callModel(
    provider,
    INSIGHTS_SYSTEM_PROMPT,
    buildInsightsPrompt(summary)
  );

  if (!reply.ok && reply.kind === "unreachable") {
    return Response.json({ error: "AI_UNREACHABLE" }, { status: 504 });
  }
  if (!reply.ok) {
    // The upstream body can carry the key back in an error echo, so only its
    // status is forwarded — the detail goes to the deployment log instead.
    console.error(
      `[insights] ${provider.name} ${reply.status}: ${reply.detail.slice(0, 500)}`
    );
    return Response.json(
      { error: "AI_REQUEST_FAILED", status: reply.status },
      { status: 502 }
    );
  }

  const text = reply.text;
  const parsed = parseRecommendations(text, summary);
  if (!parsed.ok) {
    console.error(`[insights] unusable reply (${parsed.code}): ${text.slice(0, 500)}`);
    return Response.json({ error: "AI_REPLY_UNUSABLE", code: parsed.code }, { status: 502 });
  }

  const result: InsightsResult = {
    headline: parsed.headline,
    recommendations: parsed.recommendations,
    generatedAt: summary.generatedAt,
    windowDays: INSIGHTS_WINDOW_DAYS,
    model: provider.model,
    droppedCount: parsed.droppedCount,
  };

  // The summary rides along so the phone can show the farmer the very numbers
  // the advice was built on — advice he cannot check is advice he cannot use.
  return Response.json(
    { result, summary },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate, private",
      },
    }
  );
}
