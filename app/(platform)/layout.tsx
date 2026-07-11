import { requirePlatformHost } from "@/lib/auth/host-page";

export default async function PlatformRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformHost();
  return <>{children}</>;
}
