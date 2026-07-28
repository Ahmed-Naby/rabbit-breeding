"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signIn, signUp, type AuthState } from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

type T = Dictionary["auth"];

/**
 * `useFormStatus` rather than useActionState's isPending: the submit button is
 * a child of the <form>, and this is the hook that reports its own form's
 * state — which keeps working when the two tabs swap actions underneath it.
 */
function SubmitButton({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? working : label}
    </Button>
  );
}

export function LoginForm({ t }: { t: T }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  // One state per action, so switching tabs doesn't show the other form's
  // error under the fields it doesn't belong to.
  const [loginState, loginAction] = useActionState<AuthState, FormData>(signIn, undefined);
  const [registerState, registerAction] = useActionState<AuthState, FormData>(signUp, undefined);
  const error = mode === "login" ? loginState?.error : registerState?.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background/50 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark id="login" className="size-14 shadow-sm" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">RabbitTrack</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" ? t.loginSubtitle : t.registerSubtitle}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "register")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t.loginTab}</TabsTrigger>
                <TabsTrigger value="register">{t.registerTab}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Keyed by mode so React remounts on switch instead of reusing the
                inputs — otherwise a password typed on one tab is submitted by
                the other. */}
            <form key={mode} action={mode === "login" ? loginAction : registerAction} className="space-y-4">
              {mode === "register" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t.nameLabel}</Label>
                  <Input id="name" name="name" autoComplete="name" placeholder={t.yourNamePlaceholder} />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="email">{t.emailLabel}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  className="text-start"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t.passwordLabel}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  dir="ltr"
                  className="text-start"
                />
                {mode === "register" ? (
                  <p className="text-xs text-muted-foreground">{t.passwordHint}</p>
                ) : null}
              </div>

              {mode === "register" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="farmName">{t.farmNameLabel}</Label>
                  <Input id="farmName" name="farmName" placeholder={t.farmNamePlaceholder} />
                </div>
              ) : null}

              {error ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <SubmitButton
                label={mode === "login" ? t.loginButton : t.registerButton}
                working={t.workingLabel}
              />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
