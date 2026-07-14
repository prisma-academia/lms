# UX & Navigation Audit

_Report only — no code changes. Produced alongside the Next.js compliance / route-transition / branded-email work. Recommendations here are deferred to a follow-up task._

## Scope & method
Reviewed every page area under `app/`: `(platform)/(dashboard)` (superadmin), `admin/(dashboard)` and `admin/(setup)` (tenant admin), `c/(dashboard)` (learner), `t/` (tenant public landing), `m/` (marketing), and the auth groups under each. Findings are grounded in the actual files (paths cited). Focus: how users move **up/back**, discover actions, and get feedback.

## Severity legend
- 🔴 **High** — users can get stuck or lose work; affects many pages.
- 🟡 **Medium** — friction / inconsistency; not blocking.
- 🟢 **Low** — polish.

---

## Summary of key findings
1. 🔴 Admin & platform **detail and create pages have no back link or breadcrumb** — navigation is entirely sidebar-driven. Deep links leave users to re-find the section.
2. 🟡 **Two near-duplicate header components** (`PageHeader` in `components/shell.tsx`; `DataTableToolbar` in `components/data-table-toolbar.tsx`) split list vs detail pages and must be kept in visual sync. Neither offers back/breadcrumb.
3. 🟡 **Empty states are inconsistent**: learner pages use `EmptyState` (some with a CTA, most without); admin/platform tables fall back to the bare string `"No results."` with no CTA.
4. 🔴 **Toasts and notifications exist only for learners.** `ToastProvider` and `NotificationBell` are mounted only in `StudentShell`; admin/platform mutations give silent or inline-only feedback.
5. 🔴 **Onboarding is a chrome-less trap** — `app/admin/(setup)/layout.tsx` renders no shell, nav, or logout; a stalled wizard has no exit.
6. 🟡 A few **auth cross-links are confusing** (learner forgot-password points at the admin portal; forgot-password success drops the back-to-sign-in link).
7. 🟡 **Marketing & tenant-landing headers lack a persistent Sign-in CTA**; sign-in lives only in the hero.

The learner area (`c/`, `StudentShell`) is the **best-navigated** part of the app and is a good model to standardize on.

---

## 1. Back / up navigation on detail & create pages — 🔴 High
Admin/platform detail pages render only a `PageHeader` title with **no** "back to list" link or breadcrumb. The only way up is the persistent left sidebar; on a fresh deep link the user must re-find the section.

Affected (representative): `app/admin/(dashboard)/{users,courses,programmes,quizzes,certificates,clients,events,fees,messages,user-groups,client-groups,question-banks,templates,role-templates}/[id]/page.tsx`, and `app/(platform)/(dashboard)/{tenants,plans,users,role-templates}/[id]/page.tsx`.

**Create pages** (`.../new/page.tsx` across admin & platform) similarly have no cancel/back-to-list link; forms typically expose only a submit button. Exception: `assignments/new-assignment-form.tsx` has a cancel.

**Already good (model to copy):** `app/admin/(dashboard)/assignments/[id]/page.tsx` ("← Assignments"), `app/c/(dashboard)/courses/[slug]/page.tsx` ("← Catalog"), `.../courses/[slug]/learn/learn-player.tsx` ("← Course overview"), `app/c/(dashboard)/certificates/[awardId]/page.tsx` ("← All certificates").

**Recommendation:** add a back link (or breadcrumb) to `PageHeader` — e.g. an optional `backHref`/`backLabel` prop rendered as a "← {label}" above the title — and adopt it on every `[id]`/`[slug]` and `new` page. Add a Cancel button (→ list) to create/edit forms.

## 2. Header component duplication — 🟡 Medium
`PageHeader` (`components/shell.tsx:117`) and `DataTableToolbar` (`components/data-table-toolbar.tsx`) are structurally near-identical (same `mb-6 flex justify-between`, same `font-heading text-2xl` h1). List pages use the toolbar (~20 files); detail/create/settings use `PageHeader` (~57 files). One page uses a raw `<h1>` (`assignments/[id]/page.tsx`).

**Recommendation:** unify into a single header primitive (title, subtitle, action, optional back link). Have `DataTableToolbar` compose it. No page is missing a heading, so this is consistency/maintainability, not a gap.

## 3. Empty states — 🟡 Medium
- Admin/platform lists route through `components/data-table.tsx`, whose `empty` default is the plain string `"No results."` (no CTA). Inline editor lists use bare `<p>` ("No lessons yet.", `courses/[id]/course-editor.tsx`; similar in `question-banks/[id]`, `certificates/[id]`, `resources/resource-library.tsx`).
- Learner lists use `EmptyState`, but only `my-courses/page.tsx` includes an action CTA; catalog, programmes, inbox, notifications, assignments, grades, certificates are text-only.
- `EmptyState` is used in just 12 files, only 2 of them admin.

**Recommendation:** standardize on `EmptyState` everywhere (pass it as `data-table`'s `empty`), and give primary lists an action CTA ("Create your first course", "Browse the catalog").

## 4. Feedback: toasts & notifications are learner-only — 🔴 High
`ToastProvider` is mounted only in `components/student-shell.tsx`; `useToast` is consumed only under `app/c/`. `AppShell` (admin + platform) never provides it, so admin mutations rely on inline `setError` strings and give **no success feedback**. `NotificationBell` is likewise rendered only in `StudentShell` (mobile top bar only — no desktop bell anywhere).

**Recommendation:** hoist `ToastProvider` to a global provider (this branch already adds a global `ErrorDialogProvider` in `app/layout.tsx` — `ToastProvider` can join it) so admin/platform get success/error toasts. Add a desktop notification affordance to `AppShell` and a desktop bell to `StudentShell`.

## 5. Onboarding is a chrome-less trap — 🔴 High
`app/admin/(setup)/layout.tsx` renders only `<div class="min-h-screen bg-stone-50 p-8">{children}</div>` — no shell, nav, or logout. A stalled onboarding wizard (`onboarding/onboarding-wizard.tsx`) has no in-page exit, not even logout. (Note: this branch adds `admin/(setup)/loading.tsx` + `error.tsx`, but the layout still lacks an exit.)

**Recommendation:** add a minimal header to the setup layout with the brand and a logout / "exit setup" affordance; also uses the `stone-*` palette rather than the neo-brutalist tokens — align it.

## 6. Auth cross-linking — 🟡 Medium
- 🟡 `app/c/auth/(auth)/forgot-password/page.tsx` footer links to `/admin/auth/login` ("Tenant admin sign in") — a **learner** is offered the admin portal. Back-to-client-login is only in the form's `backHref`.
- 🟡 `components/forgot-password-form.tsx` success state drops the "back to sign in" link after submit.
- 🟢 Client `login/page.tsx` and `register/page.tsx` have no page-level footer, but the forms cross-link (create account / forgot password / back to sign in). Platform and admin auth cross-links are coherent.

**Recommendation:** point learner forgot-password back to learner login; keep a back-to-sign-in link in the success state.

## 7. Marketing & tenant landing — 🟡 Medium
- `app/m/marketing-shell.tsx`: solid header + footer, but **no "Sign in"** in the header — a returning admin on the apex site has no header login path.
- `app/t/` (`components/tenant/landing-shell.tsx`): org name in header is not a link; a low-contrast (`text-ink/40`) "Admin portal" link; **no learner Sign-in in the header** — sign-in/enroll CTAs live only in the hero (`landing-hero.tsx`), so they vanish on scroll. Footer is minimal ("Powered by …" only).

**Recommendation:** add a persistent "Sign in" (+ "Enroll") CTA to both headers; make the tenant name click-to-top; raise contrast on the admin link.

## 8. Mobile learner nav coverage — 🟢 Low
`StudentShell` bottom tab bar exposes only the 5 primary tabs; the 6 secondary items (Catalog, Programmes, Certificates, Calendar, Inbox, Notifications) are reachable on mobile only via the hamburger sheet. Acceptable, but worth confirming discoverability.

## 9. Positive notes
- Learner detail pages are **not** traps: `StudentShell` persists on `courses/[slug]`, `.../learn`, `certificates/[awardId]`, each with an explicit back link; `isActive` keeps the correct tab highlighted inside course detail.
- 404 handling is now branded per area (`admin/(dashboard)`, `c/(dashboard)`, `(platform)/(dashboard)`, `c/`, plus root), each with a link home.

---

## Prioritized recommendations
1. **(🔴) Global toasts** — hoist `ToastProvider` to `app/layout.tsx` alongside `ErrorDialogProvider`; wire admin/platform success feedback.
2. **(🔴) Back navigation** — add `backHref` to the header primitive; apply to all `[id]`/`[slug]`/`new` pages; add Cancel to create/edit forms.
3. **(🔴) Onboarding exit** — give `admin/(setup)` a minimal header with logout / exit.
4. **(🟡) Unify headers** — single header component; `DataTableToolbar` composes it.
5. **(🟡) Empty states** — standardize on `EmptyState` with CTAs; make it the `data-table` default.
6. **(🟡) Auth & landing links** — fix learner forgot-password target; add persistent Sign-in CTAs to marketing/tenant headers.
7. **(🟢) Notifications on desktop** — bell in `AppShell` and desktop `StudentShell`.
