"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { useApiError } from "@/components/use-api-error";
import {
  profileCompleteness,
  type ClientProfile,
  type CompletenessItem,
  type ProfileSection,
} from "@/lib/schemas/client-profile";
import {
  ProfileEditorProvider,
  useProfileEditor,
  type IssuedCertificate,
  type OpenTarget,
  type ProfileAccount,
  type ProfileEditorContext,
  type SaveResult,
} from "./profile-ui";
import { PHOTO_ACCEPT, uploadPhoto } from "./profile-upload";
import { BasicsSection } from "./basics-section";
import { CertificationsSection, EducationSection, ExperienceSection } from "./entry-sections";
import { LanguagesSection, SkillsSection } from "./list-sections";

type SaveResponse = {
  profile: ClientProfile;
  account: ProfileAccount;
  avatarSrc: string | null;
};

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Photo                                                                       */
/* -------------------------------------------------------------------------- */

function PhotoControl({ name, src }: { name: string; src: string | null }) {
  const { uploadsEnabled, save, saving } = useProfileEditor();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The address that failed to load, so a new photo gets a fresh attempt.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = src != null && failed !== src;

  async function pick(file: File | null) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    const uploaded = await uploadPhoto(file);
    if (!uploaded.ok) {
      setBusy(false);
      setError(uploaded.message);
      return;
    }
    await save({ section: "avatar", value: { key: uploaded.key } }, "Photo updated.", { keepOpen: true });
    setBusy(false);
  }

  async function remove() {
    setError(null);
    setBusy(true);
    await save({ section: "avatar", value: { key: null } }, "Photo removed.", { keepOpen: true });
    setBusy(false);
    setConfirming(false);
  }

  const working = busy || saving;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2.5 sm:items-start">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-foreground bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
        {showPhoto ? (
          // A signed, short-lived address on the storage host: not something the
          // image optimiser can or should fetch.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={96}
            height={96}
            className="size-full object-cover"
            onError={() => setFailed(src)}
          />
        ) : (
          <span aria-hidden>{initials(name)}</span>
        )}
      </div>

      {uploadsEnabled ? (
        confirming ? (
          <div role="alertdialog" aria-label="Remove your photo?" className="flex flex-col items-center gap-1.5 sm:items-start">
            <span className="text-[13px] font-bold">Remove your photo?</span>
            <div className="flex gap-1.5">
              <Button type="button" size="xs" variant="destructive" disabled={working} onClick={remove}>
                {working ? "Removing…" : "Remove"}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                autoFocus
                disabled={working}
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <input
              ref={input}
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => void pick(event.target.files?.[0] ?? null)}
            />
            <Button
              id="photo"
              type="button"
              size="xs"
              variant="outline"
              disabled={working}
              onClick={() => input.current?.click()}
              className="scroll-mt-24"
            >
              <Icon name="upload" aria-hidden />
              {busy ? "Uploading…" : src ? "Change photo" : "Add a photo"}
            </Button>
            {src ? (
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                aria-label="Remove photo"
                disabled={working}
                onClick={() => setConfirming(true)}
              >
                <Icon name="trash" aria-hidden />
              </Button>
            ) : null}
          </div>
        )
      ) : null}

      {error ? (
        <p role="alert" className="max-w-[16rem] text-center text-xs font-bold text-destructive sm:text-left">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                                */
/* -------------------------------------------------------------------------- */

/** The strip's parts, in the order the page lists them. "About you" is three items in one. */
const STRIP: { label: string; keys: CompletenessItem["key"][] }[] = [
  { label: "Photo", keys: ["photo"] },
  { label: "About you", keys: ["headline", "bio", "location"] },
  { label: "Experience", keys: ["experience"] },
  { label: "Education", keys: ["education"] },
  { label: "Certifications", keys: ["certifications"] },
  { label: "Skills", keys: ["skills"] },
  { label: "Languages", keys: ["languages"] },
];

/** Where a "still to add" link goes, and which form it opens on the way. */
function targetFor(item: CompletenessItem): { href: string; open: OpenTarget | null } {
  if (item.section === "avatar") return { href: "#photo", open: null };
  const isEntryList = item.section === "experience" || item.section === "education" || item.section === "certifications";
  return {
    href: `#${item.section}`,
    open: { section: item.section, ...(isEntryList ? { entryId: "new" } : {}) },
  };
}

function Completeness({ issuedCount }: { issuedCount: number }) {
  const { profile, uploadsEnabled, requestOpen } = useProfileEditor();
  const completeness = useMemo(
    () => profileCompleteness(profile, { photoAvailable: uploadsEnabled, issuedCertificates: issuedCount }),
    [profile, uploadsEnabled, issuedCount]
  );
  const done = completeness.missing.length === 0;

  const segments = STRIP.map((part) => {
    const items = completeness.items.filter((item) => part.keys.includes(item.key));
    const weight = items.reduce((sum, item) => sum + item.weight, 0);
    const earned = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
    return { label: part.label, weight, filled: weight === 0 ? 0 : earned / weight };
  }).filter((segment) => segment.weight > 0);

  return (
    <div className="mt-5 border-t-2 border-dashed border-border pt-4">
      <p id="completeness" className="flex items-center gap-1.5 text-sm font-bold text-foreground">
        {done ? <Icon name="check-circle" className="size-4 text-success" aria-hidden /> : null}
        {done ? "Your profile is complete" : <span className="num">Your profile is {completeness.percent}% complete</span>}
      </p>

      {/* One block per part of the profile, as wide as that part weighs. The
          number above is the same fact for anyone who cannot see the strip. */}
      <div
        role="progressbar"
        aria-labelledby="completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completeness.percent}
        className="mt-2.5 flex gap-1"
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            title={`${segment.label}: ${segment.filled === 1 ? "done" : segment.filled === 0 ? "to do" : "started"}`}
            style={{ flexGrow: segment.weight }}
            className="h-3.5 min-w-2 basis-0 overflow-hidden rounded-[5px] border-2 border-border bg-muted"
          >
            <span
              className="block h-full bg-success transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${segment.filled * 100}%` }}
            />
          </span>
        ))}
      </div>

      {done ? null : (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span id="still-to-add" className="text-[13px] font-medium text-muted-foreground">
            Still to add
          </span>
          <ul aria-labelledby="still-to-add" className="flex flex-wrap gap-1.5">
            {completeness.missing.map((item) => {
              const target = targetFor(item);
              return (
                <li key={item.key}>
                  <a
                    href={target.href}
                    onClick={(event) => {
                      // Opens the form on the way there. If another form has
                      // unsaved changes, stay put: that form explains why.
                      if (target.open && !requestOpen(target.open)) event.preventDefault();
                    }}
                    className="inline-flex min-h-8 items-center rounded-[8px] border-2 border-border bg-background px-2.5 text-[13px] font-bold text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {item.prompt}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

export function ProfileEditor({
  initialProfile,
  initialAccount,
  initialAvatarSrc,
  uploadsEnabled,
  issued,
}: {
  initialProfile: ClientProfile;
  initialAccount: ProfileAccount;
  initialAvatarSrc: string | null;
  /** Whether this academy has file storage; without it there is no photo or proof upload. */
  uploadsEnabled: boolean;
  issued: IssuedCertificate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const report = useApiError();
  const [profile, setProfile] = useState(initialProfile);
  const [account, setAccount] = useState(initialAccount);
  const [avatarSrc, setAvatarSrc] = useState(initialAvatarSrc);
  // A learner with no name yet is here to give one: start with that form open.
  const welcome = initialProfile.displayName === "";
  const [open, setOpen] = useState<OpenTarget | null>(welcome ? { section: "basics" } : null);
  const [dirty, setDirtyState] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const [saving, setSaving] = useState(false);

  const setDirty = useCallback((next: boolean) => setDirtyState(next), []);

  // Closing or reloading the tab over unsaved changes asks first. The browser
  // owns the wording; all a page may do is say that there is something to lose.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const guard = useCallback(() => {
    if (!dirty) return true;
    setRefusals((count) => count + 1);
    return false;
  }, [dirty]);

  const requestOpen = useCallback(
    (target: OpenTarget) => {
      if (!guard()) return false;
      setOpen(target);
      return true;
    },
    [guard]
  );

  /** Close the open form and hand focus back to its section's heading. */
  const closeForm = useCallback((section: ProfileSection | undefined) => {
    setOpen(null);
    setDirtyState(false);
    if (!section) return;
    // After the form has left the page, so the heading is what is focused.
    window.setTimeout(() => document.getElementById(`${section}-title`)?.focus(), 0);
  }, []);

  const close = useCallback(() => closeForm(open?.section), [closeForm, open]);

  const save = useCallback<ProfileEditorContext["save"]>(
    (patch, done, options) => {
      // A named function so "Retry" in the error dialog can run the same save again.
      async function attempt(): Promise<SaveResult> {
        setSaving(true);
        const res = await apiPatch<SaveResponse>("/api/client/profile", patch);
        setSaving(false);

        if (res.error || !res.data) {
          const status = res.status ?? 0;
          const transient = status === 0 || status >= 500;
          // A form shows a refusal beside its own Save button. Anything with no
          // form to show it in — a removal, the photo — and anything worth
          // retrying goes to the error dialog instead.
          if (transient || options?.keepOpen) {
            report(res, transient ? () => void attempt() : undefined);
            return { ok: false, message: null };
          }
          return { ok: false, message: res.error?.message ?? "That could not be saved. Try again." };
        }

        setProfile(res.data.profile);
        setAccount(res.data.account);
        setAvatarSrc(res.data.avatarSrc);
        toast(done);
        if (!options?.keepOpen) {
          closeForm(patch.section);
        } else if (patch.section !== "avatar") {
          // An entry was removed, and its buttons went with it. Put focus on the
          // section's heading rather than let it fall back to the top of the page.
          window.setTimeout(() => document.getElementById(`${patch.section}-title`)?.focus(), 0);
        }
        // The name and photo also live in the shell around this page.
        router.refresh();
        return { ok: true };
      }
      return attempt();
    },
    [closeForm, report, router, toast]
  );

  const context = useMemo<ProfileEditorContext>(
    () => ({
      profile,
      account,
      uploadsEnabled,
      open,
      requestOpen,
      guard,
      close,
      setDirty,
      refusals,
      saving,
      save,
    }),
    [profile, account, uploadsEnabled, open, requestOpen, guard, close, setDirty, refusals, saving, save]
  );

  const name = profile.displayName || [account.firstName, account.lastName].filter(Boolean).join(" ") || account.email;

  return (
    <ProfileEditorProvider value={context}>
      <div className="flex w-full max-w-3xl flex-col gap-5">
        <header className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md sm:p-5">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
            <PhotoControl name={name} src={avatarSrc} />
            <div className="min-w-0 flex-1 sm:pt-1">
              <h1 className="break-words font-heading text-2xl leading-tight">
                {welcome && !profile.displayName ? "Complete your profile" : name}
              </h1>
              {profile.headline ? (
                <p className="mt-1 text-[15px] font-medium text-foreground">{profile.headline}</p>
              ) : (
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {welcome && !profile.displayName
                    ? "Add the name you'd like to be called. Everything else can wait until you are ready."
                    : "Add a headline so people know what you do at a glance."}
                </p>
              )}
              <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] font-medium text-muted-foreground sm:justify-start">
                {profile.location ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="map-pin" className="size-3.5" aria-hidden />
                    {profile.location}
                  </span>
                ) : null}
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Icon name="mail" className="size-3.5 shrink-0" aria-hidden />
                  <span className="break-all">{account.email}</span>
                </span>
              </p>
            </div>
          </div>
          <Completeness issuedCount={issued.length} />
        </header>

        <BasicsSection />
        <ExperienceSection />
        <EducationSection />
        <CertificationsSection issued={issued} />
        <SkillsSection />
        <LanguagesSection />
      </div>
    </ProfileEditorProvider>
  );
}
