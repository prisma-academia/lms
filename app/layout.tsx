import type { Metadata, Viewport } from "next";
import { Archivo_Black, Space_Grotesk, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

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

export const metadata: Metadata = {
  title: env.PRODUCT_NAME,
  description: `${env.PRODUCT_NAME} — deliver learning content, assess learners, keep everyone engaged, and manage your organization with built-in billing.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf1e4",
};

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
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
