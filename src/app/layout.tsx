import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/app-nav";
import { Toaster } from "@/components/ui/sonner";
import { PageWidth } from "@/components/page-width";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const geistSans = Geist({
  variable: "--font-sans",
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
  return (
    <html
      lang={locale}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-muted/30">
        <div className="flex min-h-screen">
          <Sidebar locale={locale} t={t.nav} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileNav locale={locale} t={t.nav} />
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
