"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { allQuestionTypes } from "@/lib/assessments/types";
import type { PoolRule } from "@/lib/exams/settings";
import { cn } from "@/lib/utils";
import { useBuilder } from "./builder-context";
import { intOrNull, Notice } from "./ui";

function newRuleId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * A random pool: "draw N questions from bank X matching these filters". Each
 * candidate gets a different draw; the count of matching questions updates as
 * the filters change.
 */
export function PoolEditor({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** NULL = a new rule. */
  rule: PoolRule | null;
  onSave: (rule: PoolRule) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <PoolForm key={rule?.id ?? "new"} rule={rule} onSave={onSave} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function Chip({ pressed, onClick, children, disabled }: { pressed: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-8 rounded-[8px] border-2 border-border px-2.5 text-[12.5px] font-bold outline-none transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60",
        pressed ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

function PoolForm({ rule, onSave, onClose }: { rule: PoolRule | null; onSave: (rule: PoolRule) => Promise<boolean>; onClose: () => void }) {
  const { exam, banks, tags } = useBuilder();
  const [bankId, setBankId] = useState(rule?.bankId ?? banks[0]?.id ?? "");
  const [count, setCount] = useState(String(rule?.count ?? 10));
  const [points, setPoints] = useState(rule?.points != null ? String(rule.points) : "");
  const [difficulty, setDifficulty] = useState<string>(rule?.difficulty ?? "");
  const [types, setTypes] = useState<string[]>(rule?.types ?? []);
  const [tagIds, setTagIds] = useState<string[]>(rule?.tagIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<{ key: string; available: number | null; error?: string } | null>(null);

  const draft = useMemo(
    () => ({
      id: rule?.id ?? "draft",
      bankId,
      tagIds,
      difficulty: (difficulty || null) as PoolRule["difficulty"],
      types,
      count: Math.max(1, intOrNull(count) ?? 1),
      points: intOrNull(points),
    }),
    [rule?.id, bankId, tagIds, difficulty, types, count, points]
  );
  // Count only what changes the match, not count/points.
  const matchKey = JSON.stringify([bankId, tagIds, difficulty, types]);

  useEffect(() => {
    if (!bankId) return;
    const t = setTimeout(() => {
      const q = encodeURIComponent(JSON.stringify({ ...draft, count: 1 }));
      void apiGet<{ available: number }>(`/api/tenant/exams/${exam.id}/availability?draft=${q}`).then((res) => {
        setMatches({ key: matchKey, available: res.data?.available ?? null, error: res.error?.message });
      });
    }, 300);
    return () => clearTimeout(t);
    // matchKey captures everything the count depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey, exam.id]);

  const current = matches && matches.key === matchKey ? matches : null;
  const wanted = intOrNull(count);
  const short = current?.available != null && wanted != null && wanted > current.available;

  async function save() {
    if (!bankId) return setError("Choose a question bank.");
    if (wanted == null || wanted < 1 || wanted > 500) return setError("Draw between 1 and 500 questions.");
    const p = intOrNull(points);
    if (points.trim() && (p == null || p < 0 || p > 1000)) return setError("Points must be a whole number from 0 to 1000.");
    setError(null);
    setSaving(true);
    const ok = await onSave({ ...draft, id: rule?.id ?? newRuleId(), count: wanted, points: p });
    setSaving(false);
    if (ok) onClose();
  }

  const typeOptions = allQuestionTypes();

  return (
    <DialogContent className="max-w-2xl">
      <DialogTitle>{rule ? "Edit random pool" : "Add a random pool"}</DialogTitle>
      <DialogDescription>
        Each candidate gets a different random selection, so neighbours see different questions. Questions you placed by hand are never drawn again.
      </DialogDescription>

      <div className="mt-5 flex flex-col gap-4">
        {banks.length === 0 ? (
          <Notice tone="warn">There are no question banks you can use yet. Create one under Question banks first.</Notice>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]">
          <FormField label="Draw from bank" htmlFor="pool-bank">
            <SelectInput
              id="pool-bank"
              allowEmpty={false}
              options={banks.map((b) => ({ value: b.id, label: `${b.name} (${b.questionCount})` }))}
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
            />
          </FormField>
          <FormField label="How many" htmlFor="pool-count">
            <TextInput id="pool-count" type="number" inputMode="numeric" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} />
          </FormField>
          <FormField label="Points each" htmlFor="pool-points" hint="Empty = own points">
            <TextInput id="pool-points" type="number" inputMode="numeric" min={0} max={1000} placeholder="Own" value={points} onChange={(e) => setPoints(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Difficulty" htmlFor="pool-difficulty">
          <SelectInput
            id="pool-difficulty"
            placeholder="Any difficulty"
            options={[
              { value: "EASY", label: "Easy only" },
              { value: "MEDIUM", label: "Medium only" },
              { value: "HARD", label: "Hard only" },
            ]}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          />
        </FormField>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-bold">Question types <span className="font-medium text-muted-foreground">(none chosen = any type)</span></legend>
          <div className="flex flex-wrap gap-1.5">
            {typeOptions.map((t) => (
              <Chip
                key={t.type}
                pressed={types.includes(t.type)}
                onClick={() => setTypes((prev) => (prev.includes(t.type) ? prev.filter((x) => x !== t.type) : [...prev, t.type]))}
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        {tags.length ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-bold">Tags <span className="font-medium text-muted-foreground">(any of these; none = no tag filter)</span></legend>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {tags.map((t) => (
                <Chip
                  key={t.id}
                  pressed={tagIds.includes(t.id)}
                  onClick={() => setTagIds((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                >
                  #{t.name}
                </Chip>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div aria-live="polite">
          {!bankId ? null : !current ? (
            <p className="text-[13px] font-medium text-muted-foreground">Counting matching questions…</p>
          ) : current.error ? (
            <Notice tone="error">{current.error}</Notice>
          ) : short ? (
            <Notice tone="error">
              Only <strong className="num">{current.available}</strong> {current.available === 1 ? "question matches" : "questions match"}, but this pool asks for{" "}
              <strong className="num">{wanted}</strong>. Loosen the filters, add questions to the bank, or draw fewer. The exam cannot be published like this.
            </Notice>
          ) : (
            <Notice tone={current.available === 0 ? "warn" : "ok"}>
              <strong className="num">{current.available}</strong> {current.available === 1 ? "question matches" : "questions match"}
              {wanted && current.available ? ` — each candidate gets ${wanted} of them.` : "."}
              {wanted && current.available != null && current.available > 0 && current.available < wanted * 2
                ? " With so few to choose from, candidates will see mostly the same questions."
                : ""}
            </Notice>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm font-bold text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 border-t-2 border-dashed border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || !bankId}>
            {saving ? "Saving…" : rule ? "Save pool" : "Add pool"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
