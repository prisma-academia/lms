"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import {
  LANGUAGE_PROFICIENCIES,
  LANGUAGE_PROFICIENCY_LABELS,
  PROFILE_LIMITS,
  SKILL_LEVELS,
  SKILL_LEVEL_LABELS,
  cleanText,
  newEntryId,
  type LanguageProficiency,
  type SkillLevel,
} from "@/lib/schemas/client-profile";
import {
  EmptyNote,
  FormActions,
  FormPanel,
  SectionCard,
  isOpen,
  useDraft,
  useProfileEditor,
} from "./profile-ui";

const CONTROL =
  "rounded-[10px] border-2 border-border bg-card px-3 py-2 text-[16px] font-medium text-card-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

const SKILL_LEVEL_OPTIONS = SKILL_LEVELS.map((value) => ({ value, label: SKILL_LEVEL_LABELS[value] }));
const PROFICIENCY_OPTIONS = LANGUAGE_PROFICIENCIES.map((value) => ({
  value,
  label: LANGUAGE_PROFICIENCY_LABELS[value],
}));

/* -------------------------------------------------------------------------- */
/* Skills                                                                      */
/* -------------------------------------------------------------------------- */

type SkillDraft = { id: string; name: string; level: SkillLevel | "" };

function SkillsForm() {
  const { profile, save } = useProfileEditor();
  const addId = useId();
  const addInput = useRef<HTMLInputElement>(null);
  const { values, setValues, dirty } = useDraft<{ skills: SkillDraft[]; typing: string }>({
    skills: profile.skills.map((skill) => ({ id: skill.id, name: skill.name, level: skill.level ?? "" })),
    // What is in the box but not yet added. Part of the draft, so a skill
    // someone has typed and not added is still protected from being lost.
    typing: "",
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const full = values.skills.length >= PROFILE_LIMITS.skills;

  /** Add what is typed. Commas separate several: "SQL, Python, Excel". */
  function addTyped(): SkillDraft[] {
    const names = values.typing
      .split(",")
      .map((name) => cleanText(name).slice(0, PROFILE_LIMITS.skillName))
      .filter(Boolean);
    if (names.length === 0) return values.skills;

    const have = new Set(values.skills.map((skill) => skill.name.toLowerCase()));
    const next = [...values.skills];
    let skipped = 0;
    for (const name of names) {
      if (have.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      if (next.length >= PROFILE_LIMITS.skills) break;
      have.add(name.toLowerCase());
      next.push({ id: newEntryId(), name, level: "" });
    }
    setAddError(skipped > 0 && skipped === names.length ? "That skill is already on your list." : null);
    setValues({ skills: next, typing: "" });
    return next;
  }

  async function submit() {
    // Whatever is still in the box counts: pressing Save should not drop it.
    const skills = addTyped();
    setFormError(null);
    const result = await save(
      { section: "skills", value: skills.map((skill) => ({ ...skill, level: skill.level || null })) },
      "Skills saved."
    );
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormPanel title="Edit your skills" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={addId} className="text-[13px] font-bold text-foreground">
          Add a skill
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            ref={addInput}
            id={addId}
            value={values.typing}
            disabled={full}
            autoFocus
            enterKeyHint="enter"
            aria-describedby={`${addId}-hint`}
            placeholder="SQL, Python, public speaking"
            onChange={(event) => {
              setAddError(null);
              setValues((v) => ({ ...v, typing: event.target.value }));
            }}
            onKeyDown={(event) => {
              // Enter adds a skill; it must not save the whole form mid-list.
              if (event.key === "Enter") {
                event.preventDefault();
                addTyped();
              }
            }}
            className={`${CONTROL} min-w-0 flex-1 basis-56 disabled:cursor-not-allowed disabled:opacity-60`}
          />
          <Button
            type="button"
            variant="outline"
            disabled={full || !values.typing.trim()}
            onClick={() => {
              addTyped();
              addInput.current?.focus();
            }}
          >
            <Icon name="plus" aria-hidden />
            Add
          </Button>
        </div>
        {addError ? (
          <p role="alert" className="text-xs font-bold text-destructive">
            {addError}
          </p>
        ) : null}
        <p id={`${addId}-hint`} className="text-xs font-medium text-muted-foreground">
          {full
            ? `A profile holds up to ${PROFILE_LIMITS.skills} skills. Remove one to add another.`
            : "Press Enter to add. Separate several with commas."}
        </p>
      </div>

      {values.skills.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Your skills">
          {values.skills.map((skill) => (
            <li
              key={skill.id}
              className="flex flex-wrap items-center gap-2 rounded-[10px] border-2 border-border bg-card px-3 py-2"
            >
              <span className="min-w-0 flex-1 basis-40 break-words text-sm font-bold">{skill.name}</span>
              <select
                aria-label={`Level for ${skill.name}`}
                value={skill.level}
                onChange={(event) =>
                  setValues((v) => ({
                    ...v,
                    skills: v.skills.map((s) =>
                      s.id === skill.id ? { ...s, level: event.target.value as SkillLevel | "" } : s
                    ),
                  }))
                }
                className={`${CONTROL} py-1.5 text-sm`}
              >
                <option value="">No level</option>
                {SKILL_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                aria-label={`Remove ${skill.name}`}
                onClick={() => setValues((v) => ({ ...v, skills: v.skills.filter((s) => s.id !== skill.id) }))}
              >
                <Icon name="x" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <FormActions dirty={dirty} error={formError} saveLabel="Save skills" />
    </FormPanel>
  );
}

export function SkillsSection() {
  const { profile, open, requestOpen } = useProfileEditor();
  const editing = isOpen(open, "skills");

  return (
    <SectionCard
      section="skills"
      title="Skills"
      action={
        editing ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => requestOpen({ section: "skills" })}>
            {profile.skills.length > 0 ? "Edit" : "Add skills"}
          </Button>
        )
      }
    >
      {editing ? (
        <SkillsForm />
      ) : profile.skills.length === 0 ? (
        <EmptyNote>
          List what you can do, from tools and languages to things like negotiation or teaching.
          Three or more gives a fair picture.
        </EmptyNote>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <li
              key={skill.id}
              className="inline-flex max-w-full items-baseline gap-1.5 rounded-[8px] border-2 border-border bg-background px-2.5 py-1 text-sm"
            >
              <span className="break-words font-bold text-foreground">{skill.name}</span>
              {skill.level ? (
                <span className="text-xs font-medium text-muted-foreground">{SKILL_LEVEL_LABELS[skill.level]}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Languages                                                                   */
/* -------------------------------------------------------------------------- */

type LanguageDraft = { id: string; name: string; proficiency: LanguageProficiency };

function blankLanguage(): LanguageDraft {
  return { id: newEntryId(), name: "", proficiency: "conversational" };
}

function LanguagesForm() {
  const { profile, save } = useProfileEditor();
  const [initial] = useState<{ languages: LanguageDraft[] }>(() => ({
    languages:
      profile.languages.length > 0
        ? profile.languages.map((language) => ({ ...language }))
        : // Open on one empty row: the form's first job is obvious.
          [blankLanguage()],
  }));
  const { values, setValues, dirty } = useDraft(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const full = values.languages.length >= PROFILE_LIMITS.languages;

  function change(id: string, patch: Partial<LanguageDraft>) {
    setValues((v) => ({ languages: v.languages.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }

  async function submit() {
    setFormError(null);
    // Rows left empty are rows the learner decided not to fill in.
    const languages = values.languages.filter((language) => cleanText(language.name));
    const result = await save({ section: "languages", value: languages }, "Languages saved.");
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormPanel title="Edit your languages" onSubmit={submit}>
      <ul className="flex flex-col gap-2.5">
        {values.languages.map((language, index) => (
          <li
            key={language.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]"
          >
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
              <label htmlFor={`lang-${language.id}`} className="text-[13px] font-bold text-foreground">
                Language {values.languages.length > 1 ? index + 1 : ""}
              </label>
              <input
                id={`lang-${language.id}`}
                value={language.name}
                maxLength={PROFILE_LIMITS.languageName}
                autoFocus={index === 0 || language.id === lastAdded}
                autoComplete="off"
                placeholder="Yoruba"
                onChange={(event) => change(language.id, { name: event.target.value })}
                className={`${CONTROL} w-full`}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`prof-${language.id}`} className="text-[13px] font-bold text-foreground">
                How well
              </label>
              <select
                id={`prof-${language.id}`}
                value={language.proficiency}
                onChange={(event) => change(language.id, { proficiency: event.target.value as LanguageProficiency })}
                className={`${CONTROL} w-full`}
              >
                {PROFICIENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={language.name.trim() ? `Remove ${language.name.trim()}` : `Remove language ${index + 1}`}
              onClick={() => setValues((v) => ({ languages: v.languages.filter((l) => l.id !== language.id) }))}
            >
              <Icon name="x" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={full}
          onClick={() => {
            const added = blankLanguage();
            setLastAdded(added.id);
            setValues((v) => ({ languages: [...v.languages, added] }));
          }}
        >
          <Icon name="plus" aria-hidden />
          Add another language
        </Button>
        {full ? (
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">
            A profile holds up to {PROFILE_LIMITS.languages} languages.
          </p>
        ) : null}
      </div>

      <FormActions dirty={dirty} error={formError} saveLabel="Save languages" />
    </FormPanel>
  );
}

export function LanguagesSection() {
  const { profile, open, requestOpen } = useProfileEditor();
  const editing = isOpen(open, "languages");

  return (
    <SectionCard
      section="languages"
      title="Languages"
      action={
        editing ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => requestOpen({ section: "languages" })}>
            {profile.languages.length > 0 ? "Edit" : "Add languages"}
          </Button>
        )
      }
    >
      {editing ? (
        <LanguagesForm />
      ) : profile.languages.length === 0 ? (
        <EmptyNote>
          Add the languages you speak and how well. It helps your academy match you with
          instructors, study groups and materials.
        </EmptyNote>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {profile.languages.map((language) => (
            <div key={language.id} className="flex min-w-0 items-baseline justify-between gap-3 border-b-2 border-dashed border-border pb-2">
              <dt className="min-w-0 break-words text-sm font-bold text-foreground">{language.name}</dt>
              <dd className="shrink-0 text-[13px] font-medium text-muted-foreground">
                {LANGUAGE_PROFICIENCY_LABELS[language.proficiency]}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
}
