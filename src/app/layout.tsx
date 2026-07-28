import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/app-nav";
import { Toaster } from "@/components/ui/sonner";
import { PageWidth } from "@/components/page-width";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getWebSession } from "@/lib/web-session";
import { GATED_HEADER } from "@/proxy";
import type { SessionProps } from "@/components/app-nav";

// Fallback only — Cairo (bundled in globals.css) is the face the app actually
// renders in, because Geist has no Arabic glyphs at all.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata() {
  const { t } = await getDictionary();
  return { title: "RabbitTrack", description: t.common.appDescription };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, t } = await getDictionary();
  const dir = locale === "ar" ? "rtl" : "ltr";

  // The nav is mounted only for a signed-in user. On /login there is nothing
  // to navigate to yet — a sidebar of links that would every one of them
  // bounce back to the login form is worse than no sidebar at all.
  const webSession = await getWebSession();
  // Cookie present (the proxy let it through) but it resolves to nothing — a
  // revoked token or a reset database. Without this the page below would throw
  // NoSessionError on its first query and 500 with no way back to the form.
  if (!webSession && (await headers()).get(GATED_HEADER)) redirect("/login");

  const session: SessionProps | null = webSession && {
    authT: t.auth,
    email: webSession.email,
    name: webSession.name,
    farms: webSession.memberships.map((m) => ({
      farmId: m.farmId,
      name: m.farmName,
      role: m.role,
    })),
    activeFarmId: webSession.activeFarmId,
  };
  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* The Arabic subset is on the critical path — every label on the
            first screen needs it, so start it before the bundle parses. */}
        <link
          rel="preload"
          href="/fonts/cairo-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('rabbittrack-theme') || 'system';
                var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.colorScheme = 'light';
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full bg-background/50 text-foreground transition-colors duration-300">
        <div className="flex min-h-screen">
          {session ? <Sidebar locale={locale} t={t.nav} session={session} /> : null}
          <div className="flex min-w-0 flex-1 flex-col">
            {session ? <MobileNav locale={locale} t={t.nav} session={session} /> : null}
            <main className="flex-1">
              <PageWidth>{children}</PageWidth>
            </main>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
