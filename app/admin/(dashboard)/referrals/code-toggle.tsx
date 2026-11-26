"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";

/** Switch one staff member's code on or off. Shown only to people who may. */
export function CodeToggle({
  id,
  active,
  staffName,
}: {
  id: string;
  active: boolean;
  /** Whose code this is — the button's name for a screen reader. */
  staffName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const report = useApiError();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const res = await apiPatch(`/api/tenant/referrals/${id}`, { active: !active });
    setSaving(false);
    if (!report(res, () => toggle())) return;
    toast(active ? `${staffName}'s code is switched off.` : `${staffName}'s code is active again.`);
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size="xs" onClick={toggle} disabled={saving}>
      {saving ? "Saving…" : active ? "Switch off" : "Switch on"}
      <span className="sr-only"> {staffName}&rsquo;s referral code</span>
    </Button>
  );
}
