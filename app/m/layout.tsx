import { MarketingShell } from "./marketing-shell";
import { requireApexHost } from "@/lib/auth/host-page";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await requireApexHost();
  return <MarketingShell>{children}</MarketingShell>;
}
