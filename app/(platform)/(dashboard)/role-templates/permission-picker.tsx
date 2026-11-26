"use client";

import { useId } from "react";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Choosing what a role may do, in words.
 *
 * This used to be a flat grid of raw keys — `tenant.quizzes:write` — which is
 * how the code names a permission, not how the person deciding who may edit
 * quizzes thinks about it. Here each permission is shown by its description,
 * grouped under the part of the product it belongs to, with one tick to grant
 * or remove a whole group. The key stays available as a tooltip for whoever is
 * matching a role against a support ticket.
 *
 * Shared by the platform and academy role pages and by the user detail page:
 * the caller passes the keys that exist in its scope and owns the selection.
 */

const BY_KEY = new Map<string, { key: string; module: string; description: string }>(
  ALL_PERMISSIONS.map((p) => [p.key, p])
);

/** "tenant.course-payments" → "Course payments" */
function areaLabel(module: string): string {
  const name = module.split(".").slice(1).join(" ").replace(/[-_]+/g, " ").trim() || module;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function groupByArea(keys: readonly string[]) {
  const groups = new Map<string, { key: string; description: string }[]>();
  for (const key of keys) {
    const known = BY_KEY.get(key);
    const area = known?.module ?? key.split(":")[0];
    const list = groups.get(area) ?? [];
    // A key this build does not know still has to be shown, so it can be removed.
    list.push({ key, description: known?.description ?? key });
    groups.set(area, list);
  }
  return [...groups.entries()].map(([area, items]) => ({ area, label: areaLabel(area), items }));
}

export function PermissionPicker({
  permissions,
  selected,
  onChange,
  disabled = false,
}: {
  /** Every permission key that can be granted here. */
  permissions: readonly string[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const groups = groupByArea(permissions);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function setGroup(keys: string[], on: boolean) {
    const next = new Set(selected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="num text-[13px] font-medium text-muted-foreground" aria-live="polite">
        {selected.size} of {permissions.length} permissions granted
      </p>
      {/* Columns from the space available, not the window: this sits in a
          full-width card on the role pages and a narrower one on a user's page. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
        {groups.map((group) => {
          const keys = group.items.map((item) => item.key);
          const granted = keys.filter((key) => selected.has(key)).length;
          const all = granted === keys.length;
          const groupId = `${uid}-${group.area}`;
          return (
            <fieldset
              key={group.area}
              className="min-w-0 rounded-[10px] border-2 border-border bg-background p-3"
            >
              <legend className="sr-only">{group.label}</legend>
              <label
                htmlFor={groupId}
                className="flex cursor-pointer items-center gap-2.5 border-b-2 border-dashed border-border pb-2 text-sm font-bold text-foreground"
              >
                <input
                  id={groupId}
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={all}
                  // Some but not all: the browser's own "mixed" state says so.
                  ref={(el) => {
                    if (el) el.indeterminate = granted > 0 && !all;
                  }}
                  disabled={disabled}
                  onChange={(e) => setGroup(keys, e.target.checked)}
                />
                <span className="min-w-0 flex-1">{group.label}</span>
                <span className="num shrink-0 text-xs font-bold text-muted-foreground">
                  {granted}/{keys.length}
                </span>
              </label>
              <div className="mt-2 flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    title={item.key}
                    className="flex cursor-pointer items-start gap-2.5 text-[13px] font-medium text-foreground"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={selected.has(item.key)}
                      disabled={disabled}
                      onChange={() => toggle(item.key)}
                    />
                    <span className="min-w-0">{item.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
