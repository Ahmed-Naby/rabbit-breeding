import { useState } from "react";
import { Rabbit as RabbitIcon } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, register, clearLocalMirror } from "../auth";

/**
 * Full-screen gate shown when no device token is stored (see app-shell).
 * After any successful login/register the local mirror is wiped and the app
 * reloads — the next boot bootstraps whatever farm the account belongs to.
 */
export function LoginPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale).mobileAuth;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (code: string): string => {
    switch (code) {
      case "INVALID_CREDENTIALS": return t.invalidCredentials;
      case "EMAIL_IN_USE": return t.emailInUse;
      case "PASSWORD_TOO_SHORT": return t.passwordTooShort;
      case "INVALID_EMAIL": return t.invalidEmail;
      default: return t.genericError;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
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
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? t.loginSubtitle : t.registerSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
            <button
              type="button"
              className={`rounded-md py-1.5 ${mode === "login" ? "bg-background shadow" : "text-muted-foreground"}`}
              onClick={() => { setMode("login"); setError(null); }}
            >
              {t.loginTab}
            </button>
            <button
              type="button"
              className={`rounded-md py-1.5 ${mode === "register" ? "bg-background shadow" : "text-muted-foreground"}`}
              onClick={() => { setMode("register"); setError(null); }}
            >
              {t.registerTab}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">{t.nameLabel}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </div>
            )}
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
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              {mode === "register" && <p className="text-xs text-muted-foreground">{t.passwordHint}</p>}
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <Button type="submit" disabled={busy} className="w-full py-5 font-semibold">
              {busy ? t.workingLabel : mode === "login" ? t.loginButton : t.registerButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
