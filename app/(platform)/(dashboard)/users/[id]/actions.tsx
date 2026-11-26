"use client";

import { useState } from "react";
import { apiPost, apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { PermissionPicker } from "../../role-templates/permission-picker";

/**
 * What one person can do, and the two account actions an administrator needs.
 * Shared by the platform console and by an academy's own staff page — the
 * endpoints passed in decide which kind of user is being changed.
 */
export function UserDetailActions({
  permissions,
  allPermissions,
  roles,
  applyRoleEndpoint,
  permissionsEndpoint,
  resetPasswordEndpoint,
}: {
  userId: string;
  scope: "platform" | "tenant";
  permissions: string[];
  allPermissions: readonly string[];
  roles: { id: string; name: string }[];
  applyRoleEndpoint: string;
  permissionsEndpoint: string;
  resetPasswordEndpoint: string;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(permissions));
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function applyRole() {
    if (!roleId) return;
    setPending("apply");
    setError(null);
    const res = await apiPost<{ permissions: string[] }>(applyRoleEndpoint, { roleTemplateId: roleId });
    setPending(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.permissions) {
      setSelected(new Set(res.data.permissions));
      toast("Role applied");
    }
  }

  async function savePermissions() {
    setPending("save");
    setError(null);
    const res = await apiPatch<{ permissions: string[] }>(permissionsEndpoint, {
      permissions: Array.from(selected),
    });
    setPending(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Permissions saved");
  }

  async function resetPassword() {
    const yes = await confirm({
      title: "Reset this person's password?",
      description:
        "They are signed out everywhere and emailed a temporary password, which they must change the next time they sign in.",
      confirmLabel: "Reset password",
      destructive: true,
    });
    if (!yes) return;
    setPending("reset");
    setError(null);
    const res = await apiPost(resetPasswordEndpoint, {});
    setPending(null);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Temporary password emailed");
  }

  return (
    <div className="mt-4 flex flex-col gap-6 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <FormField
          label="Apply a role"
          htmlFor="role"
          hint="Replaces this person's permissions with the role's."
          className="min-w-0 flex-1 basis-56"
        >
          <SelectInput
            id="role"
            placeholder="Choose a role…"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          />
        </FormField>
        <Button onClick={applyRole} disabled={pending !== null || !roleId}>
          {pending === "apply" ? "Applying…" : "Apply role"}
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-bold text-foreground">Permissions</h3>
        <PermissionPicker
          permissions={allPermissions}
          selected={selected}
          onChange={setSelected}
          disabled={pending !== null}
        />
        <div className="mt-3">
          <Button onClick={savePermissions} disabled={pending !== null}>
            {pending === "save" ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <div className="border-t-2 border-dashed border-border pt-4">
        <h3 className="text-[13px] font-bold text-foreground">Sign-in</h3>
        <p className="mt-1 text-[13px] font-medium text-muted-foreground">
          Use this if they are locked out or their account may be compromised.
        </p>
        <Button className="mt-3" variant="outline" onClick={resetPassword} disabled={pending !== null}>
          {pending === "reset" ? "Resetting…" : "Reset password and sign out"}
        </Button>
      </div>
    </div>
  );
}
