import "server-only";

/**
 * The one place that knows how to ask a model for the analysis.
 *
 * Two providers, because the choice is the farm's and not the code's: Gemini
 * has a free tier generous enough to press the button daily, Anthropic is what
 * the rest of the world's examples are written against. Both take the same two
 * strings (a system prompt and a user prompt) and give back one string, so the
 * route above stays about farms and the citation gate stays about numbers.
 *
 * Selection is by key: whichever key the deployment holds is the provider it
 * uses. INSIGHTS_PROVIDER only matters when both keys are present.
 */

export type ProviderName = "gemini" | "anthropic";

export type Provider = {
  name: ProviderName;
  apiKey: string;
  model: string;
};

/**
 * Fast, cheap, and good enough for six paragraphs of barn Arabic.
 *
 * Pinned rather than pointed at `gemini-flash-latest`: a floating alias would
 * change the model under a farm that never asked for it, and this month's
 * advice should be reproducible against last month's. Note that the older
 * 2.5-flash is refused outright for keys issued now ("no longer available to
 * new users"), so this is a floor as much as a preference.
 */
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Six recommendations of Arabic prose, with room to spare — and the room
 * matters more than it looks. Arabic costs several tokens a word, and a JSON
 * answer that runs out of budget doesn't come back short, it comes back
 * unparseable: the closing braces are simply never written. 2000 was measured
 * against a real farm and truncated mid-object.
 */
const PROSE_TOKENS = 4000;
/**
 * Gemini spends output tokens on thinking before it writes a word, and the
 * budget below is drawn from the same purse as the prose — so the ceiling has
 * to cover both, not one of them.
 */
const GEMINI_THINKING_BUDGET = 1024;
/** Under the route's maxDuration, so a hung upstream is our error, not Vercel's. */
const REQUEST_TIMEOUT_MS = 50_000;

/**
 * Null when no key is configured at all — the caller turns that into the 503
 * that tells the farmer the feature simply isn't switched on yet.
 */
export function resolveProvider(): Provider | null {
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const preferred = process.env.INSIGHTS_PROVIDER?.trim().toLowerCase();

  const wantsAnthropic = preferred === "anthropic";
  if (gemini && !wantsAnthropic) {
    return { name: "gemini", apiKey: gemini, model: geminiModel() };
  }
  if (anthropic) {
    return { name: "anthropic", apiKey: anthropic, model: anthropicModel() };
  }
  // Asked for Anthropic but only the Gemini key is present: answer with the
  // key that exists rather than refusing over a preference.
  if (gemini) return { name: "gemini", apiKey: gemini, model: geminiModel() };
  return null;
}

function geminiModel(): string {
  return process.env.INSIGHTS_MODEL ?? DEFAULT_GEMINI_MODEL;
}

function anthropicModel(): string {
  return process.env.INSIGHTS_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
}

export type ModelReply =
  | { ok: true; text: string }
  /** The request never landed — DNS, network, or our own timeout. */
  | { ok: false; kind: "unreachable" }
  /** It landed and was refused. `detail` is for the log, never for the phone. */
  | { ok: false; kind: "failed"; status: number; detail: string };

export async function callModel(
  provider: Provider,
  system: string,
  prompt: string
): Promise<ModelReply> {
  const request =
    provider.name === "gemini"
      ? geminiRequest(provider, system, prompt)
      : anthropicRequest(provider, system, prompt);

  let upstream: Response;
  try {
    upstream = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, kind: "unreachable" };
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return { ok: false, kind: "failed", status: upstream.status, detail };
  }

  const body = (await upstream.json()) as unknown;
  return {
    ok: true,
    text: provider.name === "gemini" ? geminiText(body) : anthropicText(body),
  };
}

type UpstreamRequest = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

function geminiRequest(provider: Provider, system: string, prompt: string): UpstreamRequest {
  return {
    // The key goes in a header, not the query string: URLs end up in access
    // logs and error traces, and a logged key is a leaked key.
    url: `${GEMINI_BASE}/${encodeURIComponent(provider.model)}:generateContent`,
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": provider.apiKey,
    },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: PROSE_TOKENS + GEMINI_THINKING_BUDGET,
        // Ask for JSON at the protocol level too, not only in the prompt. The
        // parser still runs — this narrows what it has to forgive.
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
      },
    },
  };
}

function anthropicRequest(provider: Provider, system: string, prompt: string): UpstreamRequest {
  return {
    url: ANTHROPIC_URL,
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: {
      model: provider.model,
      max_tokens: PROSE_TOKENS,
      system,
      messages: [{ role: "user", content: prompt }],
    },
  };
}

function geminiText(body: unknown): string {
  const candidate = (
    body as {
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
    }
  ).candidates?.[0];
  // A run that stops for any reason but STOP hands back half an object, and
  // the parser downstream can only report "not JSON". Name the real cause here
  // so the log says "MAX_TOKENS" instead of sending someone hunting a parser bug.
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    console.error(`[insights] gemini stopped early: ${candidate.finishReason}`);
  }
  const parts = candidate?.content?.parts ?? [];
  return parts
    // A thinking part carries reasoning, not answer. Concatenating it would
    // paste prose into the middle of the JSON and fail the parse.
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function anthropicText(body: unknown): string {
  const reply = body as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  if (reply.stop_reason === "max_tokens") {
    console.error("[insights] anthropic stopped early: max_tokens");
  }
  const content = reply.content ?? [];
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}
