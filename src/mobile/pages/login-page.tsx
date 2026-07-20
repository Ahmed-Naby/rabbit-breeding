import { useState } from "react";
import { Rabbit as RabbitIcon } from "lucide-react";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { login, register } from "../auth";

/**
 * Full-screen gate shown when no device token is stored (see app-shell).
 * Sign-in and self-registration (new account + new farm) both live here.
 * After a successful login/register the app reloads to bootstrap into that
 * farm's own local database (each farm has its own — see db/client.ts).
 */
export function LoginPage({ locale }: { locale: Locale }) {
  const t = getClientDictionary(locale).mobileAuth;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [farmName, setFarmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (code: string): string => {
    switch (code) {
      case "INVALID_CREDENTIALS": return t.invalidCredentials;
      case "INVALID_EMAIL": return t.invalidEmail;
      case "EMAIL_IN_USE": return t.emailInUse;
      case "PASSWORD_TOO_SHORT": return t.passwordTooShort;
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
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name.trim(), farmName.trim());
      }
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

          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value as "login" | "register");
              setError(null);
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="login">{t.loginTab}</TabsTrigger>
              <TabsTrigger value="register">{t.registerTab}</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">{t.nameLabel}</Label>
                <Input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
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
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">{t.farmNameLabel}</Label>
                <Input
                  type="text"
                  placeholder={t.farmNamePlaceholder}
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  disabled={busy}
                />
              </div>
            )}

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
