/**
 * «تحليل ذكي للأداء» — the one screen in the offline app that cannot work
 * offline, and says so plainly.
 *
 * Everything else here is written against the local SQLite mirror and keeps
 * working in a barn with no signal. This page is the exception: the analysis
 * runs on the server, because the API key that pays for it must never ship
 * inside an APK. So the button is disabled without a connection rather than
 * failing halfway, and the last answer is kept on the device so a farmer who
 * walks out of coverage still has this morning's advice in his pocket.
 *
 * The result is cached per farm and never auto-refreshed. Each press costs a
 * real API call, and a page that silently re-ran on every visit would spend
 * the farm's money to tell it what it already read five minutes ago.
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles, AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LocalDate } from "@/components/local-date";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import type { InsightsResult, Priority } from "@/lib/insights/recommendations";
import { syncFetch } from "../sync/sync-manager";
import { getSession } from "../auth";

/** Module-level so LocalDate's effect doesn't re-run on every render. */
const STAMP_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  high: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  medium:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  low: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

/**
 * Per farm, because a phone can be logged into two of them and last week's
 * advice about one barn must never reappear under the other's name.
 */
function cacheKey(): string {
  return `rabbittrack.insights.${getSession()?.activeFarmId ?? "default"}`;
}

function readCache(): InsightsResult | null {
  try {
    const raw = window.localStorage.getItem(cacheKey());
    return raw ? (JSON.parse(raw) as InsightsResult) : null;
  } catch {
    // A corrupt cache is not worth a broken page — it just means no history.
    return null;
  }
}

/**
 * The server's error code out of syncFetch's thrown message.
 *
 * syncFetch flattens every failure into one string ("<path> failed: <status>
 * <body>"), so the structured code has to be recovered from it. Anything we
 * don't recognise falls through to the generic sentence rather than printing
 * a raw HTTP body at a farmer.
 */
function errorCodeFrom(error: unknown, known: Record<string, string>): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const code of Object.keys(known)) {
    if (code !== "generic" && message.includes(code)) return code;
  }
  return "generic";
}

export function InsightsPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale);
  const it = t.insights;

  // Both read straight into the initial state rather than through an effect:
  // localStorage and navigator.onLine are synchronous, and setting them after
  // the first paint would flash "no advice yet" over advice we already have.
  const [result, setResult] = useState<InsightsResult | null>(readCache);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => window.navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const body = (await syncFetch("/api/insights", { method: "POST" })) as {
        result: InsightsResult;
      };
      setResult(body.result);
      try {
        window.localStorage.setItem(cacheKey(), JSON.stringify(body.result));
      } catch {
        // Storage full or blocked: the answer is on screen, which is what
        // was asked for. Only the "still here tomorrow" part is lost.
      }
    } catch (e) {
      setError(errorCodeFrom(e, it.errors));
    } finally {
      setRunning(false);
    }
  }, [it.errors]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-6 text-primary" />
            {it.title}
          </span>
        }
        description={it.subtitle}
        actions={
          <Button onClick={() => void run()} disabled={running || !online}>
            {running ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {running ? it.running : result ? it.rerun : it.run}
          </Button>
        }
      />

      {!online && (
        <Card className="border-amber-300/70 dark:border-amber-800/70">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-amber-700 dark:text-amber-400">
            <WifiOff className="h-4 w-4 shrink-0" />
            {it.offline}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-300/70 dark:border-red-900/70">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {it.errors[error] ?? it.errors.generic}
          </CardContent>
        </Card>
      )}

      {result === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {it.intro}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-base font-semibold">{result.headline}</p>
              <p className="text-xs text-muted-foreground">
                {it.generatedAtLabel}:{" "}
                <LocalDate date={result.generatedAt} options={STAMP_OPTS} locale={locale} />
                {" · "}
                {it.windowNote(result.windowDays)}
              </p>
              {result.droppedCount > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {it.droppedNote(result.droppedCount)}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {result.recommendations.map((rec, i) => (
              <Card key={`${i}-${rec.title}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{rec.title}</span>
                    <Badge variant="outline" className={PRIORITY_CLASS[rec.priority]}>
                      {it.priority[rec.priority]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.detail}</p>
                  <p className="text-sm">
                    <span className="font-medium">{it.actionLabel}: </span>
                    {rec.action}
                  </p>
                  {/* The provenance line. Deliberately the raw metric paths:
                      they are what the validator checked, and translating them
                      into prose would put a layer between the claim and the
                      figure it can be checked against. */}
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {it.basedOnLabel}: {rec.metrics.join(" · ")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="px-1 text-xs text-muted-foreground">{it.disclaimer}</p>
        </>
      )}
    </div>
  );
}
