import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Archivo_Black, Space_Grotesk, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { cn } from "@/lib/utils";
import { RouteProgress } from "@/components/route-progress";
import { ErrorDialogProvider } from "@/components/error-dialog";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeScript } from "@/components/theme-script";
import { resolveThemeForRequest } from "@/lib/theme/resolve";
import {
  buildPlatformMetadata,
  buildPlatformViewport,
  requestOrigin,
} from "@/lib/site/metadata";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

const archivoBlack = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-archivo",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  return buildPlatformMetadata(await requestOrigin());
}

export const viewport: Viewport = buildPlatformViewport();

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  // <html> exists only here, so the per-tenant theme must be resolved at the
  // root even though the tenant/platform split happens in layouts below.
  const theme = await resolveThemeForRequest();
  return (
    <html
      lang={locale}
      // `system` mode is corrected by ThemeScript before paint, which the server
      // cannot predict on a first visit. Scoped to <html> so genuine mismatches
      // elsewhere still warn.
      suppressHydrationWarning
      data-theme={theme.preset ?? undefined}
      // Inline style outranks the [data-theme] block — this is what "brand
      // colour layered over the preset" means. It also lands in the first byte
      // of HTML, so there is no flash.
      style={theme.brandVars ?? undefined}
      className={cn(
        "h-full",
        "antialiased",
        theme.dark && "dark",
        spaceGrotesk.variable,
        archivoBlack.variable,
        geistMono.variable,
        "font-sans"
      )}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-[100dvh] flex-col">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <ErrorDialogProvider>{children}</ErrorDialogProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
