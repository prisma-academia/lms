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
  return (
    <html
      lang={locale}
      className={cn(
        "h-full",
        "antialiased",
        spaceGrotesk.variable,
        archivoBlack.variable,
        geistMono.variable,
        "font-sans"
      )}
    >
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
