import { useState } from "react";
import { Rabbit as RabbitIcon } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, clearLocalMirror } from "../auth";

/**
 * Full-screen gate shown when no device token is stored (see app-shell).
 * Login only — accounts are created by the farm owner from Settings, never
 * self-registered here. After a successful login the local mirror is wiped
 * and the app reloads, bootstrapping the account's farm (a supervisor
 * belongs to exactly one, so there's no farm to choose).
 */
export function LoginPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale).mobileAuth;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (code: string): string => {
    switch (code) {
      case "INVALID_CREDENTIALS": return t.invalidCredentials;
      case "INVALID_EMAIL": return t.invalidEmail;
      // Surface the raw failure (HTTP code / fetch error) alongside the
      // friendly text — a bare "check your internet" hid a server 500 once
      // and a misconfigured base URL another time. Owner-facing app; the
      // detail is diagnostic gold and harmless.
      default: return code ? `${t.genericError} (${code})` : t.genericError;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      // New identity — drop whatever farm the mirror held and re-bootstrap.
      await clearLocalMirror();
      window.location.reload();
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : ""));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" dir={locale === "ar" ? "rtl" : "ltr"}>
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <RabbitIcon className="size-10 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">RabbitTrack</h1>
            <p className="text-sm text-muted-foreground">{t.loginSubtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">{t.emailLabel}</Label>
              <Input
                type="email"
                dir="ltr"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">{t.passwordLabel}</Label>
              <Input
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <Button type="submit" disabled={busy} className="w-full py-5 font-semibold">
              {busy ? t.workingLabel : t.loginButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
