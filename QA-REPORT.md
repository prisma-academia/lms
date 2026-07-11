# Prisma LMS — Comprehensive QA Report

**Date:** Saturday, July 11, 2026  
**Environment:** `http://localhost:3000` (Next.js 16.2.6 dev server)  
**Tenant tested:** `http://demo.localhost:3000` → Greenfield Academy Lagos  
**Test accounts used:**
- Tenant admin: `admin@demo.test` / `Password123!`
- Student: `rashida@demo.test` / `Password123!`
- Platform admin: `admin@example.com` / `change-me-12ch` (invalid on current DB)

**Method:** Live browser testing (Playwright) — visual, logical, implementation, and mobile responsive checks across marketing, tenant admin, and client portals.

---

## Executive Summary

| Area | Status | Score |
|------|--------|-------|
| Marketing / Apex | Working | 9/10 |
| Tenant Admin Portal | Mostly working, 1 critical bug | 7/10 |
| Client / Student Portal | Excellent | 9.5/10 |
| Platform Admin | Could not test (auth blocked) | N/A |
| Mobile Responsive | Good (client great, admin tables scroll) | 8/10 |

**Overall:** The app is in strong shape. The **student portal is production-quality**. The **admin portal** has one **critical broken page** (Calendar) and several polish issues. The **platform admin** could not be tested because seed credentials do not match the remote database.

**Pages tested:** ~43  
**Pages working:** ~36  
**Coverage:** ~84%

---

## Table of Contents

1. [Critical Bugs](#critical-bugs)
2. [High-Priority Bugs](#high-priority-bugs)
3. [Medium-Priority UX / Polish Issues](#medium-priority-ux--polish-issues)
4. [Low-Priority Improvements](#low-priority-improvements)
5. [What's Working Well](#whats-working-well)
6. [Page-by-Page Results](#page-by-page-results)
7. [Mobile Responsive Testing](#mobile-responsive-testing)
8. [Console Errors Observed](#console-errors-observed)
9. [Recommended Fix Priority](#recommended-fix-priority)
10. [Test Coverage Summary](#test-coverage-summary)
11. [Appendix: Environment & Routes](#appendix-environment--routes)

---

## Critical Bugs

### 1. Admin Calendar Page Completely Broken

| Field | Detail |
|-------|--------|
| **Route** | `/admin/events` |
| **Severity** | Critical |
| **Symptom** | Error boundary — "Could not load this page" |
| **Console** | `Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server"` |
| **Root cause** | `app/admin/(dashboard)/events/page.tsx` passes `eventHref={(id) => ...}` (a function) from a Server Component to the Client Component `<MonthCalendar>` |
| **Impact** | Admins cannot view the calendar at all. They *can* create events via `/admin/events/new`, but cannot see them on the calendar grid. |
| **Fix** | Replace the function prop with a string prefix, e.g. `eventHrefPrefix="/admin/events"` and build links inside the client component as `` `${eventHrefPrefix}/${id}` `` |
| **Note** | Client calendar (`/calendar`) works fine because it does not pass `eventHref`. |

**Affected files:**
- `app/admin/(dashboard)/events/page.tsx` (line 59)
- `components/month-calendar.tsx` (lines 34, 40, 109–110)

---

### 2. Hydration Mismatch on Currency Select (Systemic)

| Field | Detail |
|-------|--------|
| **Severity** | Critical (runtime error, client re-render) |
| **Affected pages** | Settings, New Course, Course Editor, New Fee, Programme Editor, Platform Plan Form |
| **Symptom** | Console error: `Hydration failed because the server rendered text didn't match the client` |
| **Root cause** | `lib/geo/currencies.ts` → `getCurrencyOptions()` uses `Intl.DisplayNames` + `localeCompare` at render time. Node.js and Chrome produce different label text/ordering. |
| **Fix** | Pre-compute currency options once on the server and pass them as props, or use a static label map instead of `Intl` at render time. |

**Affected files:**
- `lib/geo/currencies.ts`
- `app/admin/(dashboard)/settings/form.tsx`
- `app/admin/(dashboard)/courses/new/new-course-form.tsx`
- `app/admin/(dashboard)/courses/[id]/course-editor.tsx`
- `app/admin/(dashboard)/fees/new/create-form.tsx`
- `app/admin/(dashboard)/programmes/[id]/programme-editor.tsx`
- `app/(platform)/(dashboard)/plans/plan-form.tsx`

Similar patterns may exist in:
- `lib/geo/timezones.ts`
- `lib/geo/locales.ts`
- `lib/geo/countries.ts`

---

### 3. Platform Admin Login — Credentials Invalid

| Field | Detail |
|-------|--------|
| **Route** | `http://platform.localhost:3000/auth/login` |
| **Severity** | Critical (blocks entire portal testing) |
| **Symptom** | `admin@example.com` / `change-me-12ch` → "Invalid credentials" (401) |
| **Impact** | Entire platform admin portal untestable (~15 pages: tenants, plans, analytics, users, settings, etc.) |
| **Fix** | Run `npm run db:seed` against the current database, or provide valid platform admin credentials. |

**Note:** The login page itself renders correctly and error handling works ("Invalid credentials." message displays properly). The workspace picker on the login page loads tenants: Fix Test Co, Greenfield Academy Lagos, prisma academia.

---

## High-Priority Bugs

### 4. Billing Page — Duplicate React Keys

| Field | Detail |
|-------|--------|
| **Route** | `/admin/billing` |
| **Severity** | High |
| **Symptom** | 5 console errors: `Encountered two children with the same key` |
| **Cause** | Nigerian bank dropdown uses bank codes as React keys; several banks share codes (`50572`, `50739`, `50840`, `51253`, `057`) |
| **Fix** | Use a unique key (e.g. bank name + code, or a stable composite identifier). |

---

### 5. Invalid Course ID Shows Blank Page

| Field | Detail |
|-------|--------|
| **Route** | `/admin/courses/intro-javascript` (slug instead of CUID) |
| **Severity** | High |
| **Symptom** | Page renders layout + trial banner only — no content, no 404 message |
| **Fix** | Call `notFound()` when course lookup fails. |

---

### 6. S3 Resource Thumbnails Broken

| Field | Detail |
|-------|--------|
| **Route** | `/admin/resources` |
| **Severity** | High |
| **Symptom** | PNG resource ("Brand colour palette") shows broken/empty image thumbnail |
| **Cause** | `S3_PUBLIC_BASE_URL` is commented out in `.env`; MinIO objects are not publicly accessible |
| **Fix** | Set `S3_PUBLIC_BASE_URL` to the public MinIO bucket URL, or use presigned URLs for thumbnails. |

---

## Medium-Priority UX / Polish Issues

### 7. Raw Zod Validation Messages on Registration

| Field | Detail |
|-------|--------|
| **Route** | `/register` |
| **Symptom** | Empty form submit shows developer-facing errors |
| **Examples** | `"Too small: expected string to have >=1 characters"`, `"Invalid email address"` |
| **Fix** | Map Zod errors to user-friendly messages (e.g. "First name is required", "Password must be at least 12 characters"). |

---

### 8. Activity Log Shows Raw Internal Data

| Field | Detail |
|-------|--------|
| **Routes** | `/admin/dashboard`, `/admin/activity` |
| **Issues** | |
| | Actions shown as raw keys: `auth.login`, `grade.create`, `certificate.award` |
| | Actor/Target columns show CUIDs: `TENANT_USER:cmrggxtm...`, `Grade:—` |
| | Dashboard timestamps are raw ISO: `2026-07-11T15:50:08.133Z` |
| | Users table uses localized format: `11/07/2026, 16:50:06` (inconsistent) |
| **Fix** | Humanize action labels, resolve actor/target to names, use consistent `date-fns` formatting everywhere. |

---

### 9. Terminology Inconsistency: "Learners" vs "Clients"

| Field | Detail |
|-------|--------|
| **Location** | Admin sidebar vs page content |
| **Sidebar nav** | "Learners" (`/admin/clients`) |
| **Page title** | "Clients" |
| **Button** | "New client" |
| **Fix** | Pick one term and use it consistently (recommend "Learners" for LMS context). |

---

### 10. Lesson Body Does Not Render Markdown

| Field | Detail |
|-------|--------|
| **Route** | `/courses/intro-javascript/learn` |
| **Symptom** | Lesson text shows literal backticks: `` `for` and `while` loops repeat work... `` |
| **Fix** | Render lesson body through a markdown/code renderer. |

---

### 11. Template Type Shows Raw Slug

| Field | Detail |
|-------|--------|
| **Route** | `/admin/templates` |
| **Symptom** | Type column shows `email_welcome` instead of "Email — Welcome" |
| **Fix** | Map template type slugs to display labels. |

---

## Low-Priority Improvements

| # | Issue | Location | Suggestion |
|---|-------|----------|------------|
| 12 | Admin tables horizontal scroll on mobile | All admin list pages | Add card-based mobile layout or hide non-essential columns |
| 13 | Activity timestamps overflow on mobile | Admin dashboard | Use relative time ("2 min ago") or truncate |
| 14 | Sidebar tenant name truncated | Admin mobile header | Show abbreviated name or tooltip |
| 15 | Catalog card heights uneven | Client `/courses` | Use `min-height` or flex alignment when titles wrap |
| 16 | Next.js Dev Tools button overlaps UI | All pages (dev only) | Not a prod issue; disappears in production build |
| 17 | Redundant DB queries in admin layout | Every admin page load | Layout re-fetches user/tenant that `requireTenantPage` already loaded |
| 18 | Question Banks page not visually tested | `/admin/question-banks` | Likely works (same patterns) but was not opened this session |
| 19 | Client Groups page not visually tested | `/admin/client-groups` | Same as above |

---

## What's Working Well

### Marketing / Apex (`localhost:3000`)

- Landing page renders cleanly with hero, features, pricing (₦29,000 / ₦79,000 / Custom), and CTA
- Registration wizard (3-step) loads with proper form fields
- Client-side validation fires on empty submit
- Anchor navigation (Features, How it works, Pricing) works
- Legacy routes `/pricing` and `/how-it-works` redirect to in-page anchors
- Mobile: stacks vertically, readable, CTAs accessible

### Tenant Admin Portal (`demo.localhost:3000/admin`)

**21 sidebar pages tested. 20 of 21 work.**

| Page | Status | Notes |
|------|--------|-------|
| Dashboard | ✅ | Stats cards, trial banner, activity feed |
| Users | ✅ | Table with search, sort, invite |
| User Groups | ✅ | Renders |
| Learners | ✅ | 3 demo clients listed |
| Courses | ✅ | 7 courses, search, sort |
| Course Detail | ✅ | Full editor: lessons, groups, publish |
| New Course | ✅ | Form with validation |
| Programmes | ✅ | 2 programmes |
| Assignments | ✅ | Card layout with status badges |
| Quizzes | ✅ | Table with pass threshold |
| Certificates | ✅ | Template list |
| **Calendar** | ❌ | Error boundary crash |
| New Event | ✅ | Full form works |
| Messages | ✅ | Inbox with read/unread |
| Resources | ✅ | File cards (1 broken thumbnail) |
| Enrollments | ✅ | Progress tracking |
| Fees | ✅ | Fee definitions with amounts |
| Billing | ✅ | Plan, usage, bank form (key warnings) |
| Course Payments | ✅ | Empty state |
| Roles | ✅ | 3 role templates |
| Templates | ✅ | Email templates |
| Activity | ✅ | Audit log (raw data) |
| Settings | ✅ | Full tenant config form |

**Admin highlights:**
- Login flow works; redirects to dashboard
- Trial banner ("365 days left") displays correctly
- Data tables support search, sort, pagination
- Course editor is feature-rich (lessons, groups, publish/unpublish)
- Billing page shows plan usage meters and payout bank form
- Sign out works

### Client / Student Portal (`demo.localhost:3000`)

**11 nav items tested. All work.**

| Page | Status | Highlights |
|------|--------|------------|
| Dashboard | ✅ ⭐ | Stats, weekly chart, resume cards, due radar |
| My Courses | ✅ ⭐ | Progress cards with "Done" badges |
| Learn Player | ✅ ⭐ | Lesson list, progress, mark complete, nav |
| Tasks | ✅ ⭐ | To Do / Done columns, submit, grades |
| Grades | ✅ | Term average, per-course breakdown |
| Profile | ✅ | Editable name/phone |
| Catalog | ✅ ⭐ | 7 courses, search, enroll CTA |
| Programmes | ✅ | Programme cards |
| Certificates | ✅ | Earned certificate with ID |
| Calendar | ✅ | Month grid with colored events |
| Inbox | ✅ | Messages with type badges |
| Notifications | ✅ | Alerts + delivery preferences matrix |

**Client highlights:**
- Polished neo-brutalist design with consistent iconography
- Bottom nav on mobile (Home, Courses, Tasks, Grades, Profile)
- Progress tracking throughout (courses, lessons, assignments)
- Notification preferences matrix (in-app + email per category)
- Course learn player with lesson navigation and completion

---

## Page-by-Page Results

### Marketing / Apex

| Route | HTTP | Visual | Logic | Notes |
|-------|------|--------|-------|-------|
| `/` | 200 | ✅ | ✅ | Full landing page |
| `/register` | 200 | ✅ | ⚠️ | Raw Zod errors on validation |

### Platform Admin

| Route | HTTP | Visual | Logic | Notes |
|-------|------|--------|-------|-------|
| `/auth/login` | 200 | ✅ | ❌ | Credentials invalid; workspace picker works |

### Tenant Admin

| Route | HTTP | Visual | Logic | Notes |
|-------|------|--------|-------|-------|
| `/admin/auth/login` | 200 | ✅ | ✅ | Login works |
| `/admin/dashboard` | 200 | ✅ | ⚠️ | Raw ISO timestamps in activity |
| `/admin/users` | 200 | ✅ | ✅ | |
| `/admin/user-groups` | 200 | ✅ | ✅ | |
| `/admin/clients` | 200 | ✅ | ✅ | Terminology mismatch |
| `/admin/courses` | 200 | ✅ | ✅ | |
| `/admin/courses/new` | 200 | ✅ | ⚠️ | Hydration mismatch |
| `/admin/courses/[id]` | 200 | ✅ | ✅ | Rich editor |
| `/admin/programmes` | 200 | ✅ | ✅ | |
| `/admin/assignments` | 200 | ✅ | ✅ | |
| `/admin/question-banks` | — | — | — | Not opened |
| `/admin/quizzes` | 200 | ✅ | ✅ | |
| `/admin/certificates` | 200 | ✅ | ✅ | |
| `/admin/events` | 200 | ❌ | ❌ | **Error boundary** |
| `/admin/events/new` | 200 | ✅ | ✅ | |
| `/admin/messages` | 200 | ✅ | ✅ | |
| `/admin/resources` | 200 | ⚠️ | ✅ | Broken PNG thumbnail |
| `/admin/enrollments` | 200 | ✅ | ✅ | |
| `/admin/fees` | 200 | ✅ | ✅ | |
| `/admin/billing` | 200 | ✅ | ⚠️ | Duplicate React keys |
| `/admin/course-payments` | 200 | ✅ | ✅ | Empty state |
| `/admin/role-templates` | 200 | ✅ | ✅ | |
| `/admin/templates` | 200 | ✅ | ⚠️ | Raw type slugs |
| `/admin/activity` | 200 | ✅ | ⚠️ | Raw CUIDs in table |
| `/admin/settings` | 200 | ✅ | ⚠️ | Hydration mismatch |
| `/admin/client-groups` | — | — | — | Not opened |

### Client Portal

| Route | HTTP | Visual | Logic | Notes |
|-------|------|--------|-------|-------|
| `/auth/login` | 200 | ✅ | ✅ | |
| `/dashboard` | 200 | ✅ | ✅ | |
| `/my-courses` | 200 | ✅ | ✅ | |
| `/courses` | 200 | ✅ | ✅ | Catalog |
| `/courses/[slug]/learn` | 200 | ✅ | ⚠️ | No markdown rendering |
| `/assignments` | 200 | ✅ | ✅ | |
| `/grades` | 200 | ✅ | ✅ | |
| `/profile` | 200 | ✅ | ✅ | |
| `/programmes` | 200 | ✅ | ✅ | |
| `/certificates` | 200 | ✅ | ✅ | |
| `/calendar` | 200 | ✅ | ✅ | Works (unlike admin) |
| `/inbox` | 200 | ✅ | ✅ | |
| `/notifications` | 200 | ✅ | ✅ | |

---

## Mobile Responsive Testing

**Viewport tested:** 375×812 (iPhone-sized)

| Portal | Adaptation | Quality | Notes |
|--------|------------|---------|-------|
| Client | Bottom nav, stacked cards, lesson dropdown | ⭐ Excellent | Header with notifications + profile avatar |
| Admin | Hamburger menu, 2×2 stat grid, horizontal table scroll | Good | Activity timestamps overflow |
| Marketing | Single column, full-width CTAs | Good | All sections stack cleanly |
| Learn player | Collapsible lesson selector, stacked content | Good | Mark complete + nav buttons accessible |

### Mobile-Specific Issues

1. **Admin tables** require horizontal scroll (e.g. Users table shows scrollbar)
2. **Activity feed** on admin dashboard shows full ISO timestamps that overflow narrow screens
3. **Tenant name** in admin mobile header may truncate on long names

### Mobile-Specific Wins

1. Client portal bottom navigation is well-implemented
2. Stat cards reflow to 2×2 grid on both portals
3. Marketing page is fully usable on mobile
4. Learn player adapts with lesson dropdown instead of side-by-side layout

---

## Console Errors Observed

| Page | Error Type | Count | Details |
|------|-----------|-------|---------|
| `/admin/events` | RSC function prop | 3 | `eventHref` function passed to Client Component |
| `/admin/settings` | Hydration mismatch | 1 | Currency select options differ server/client |
| `/admin/courses/new` | Hydration mismatch | 1 | Same currency select issue |
| `/admin/billing` | Duplicate React keys | 5 | Bank code keys not unique |
| `platform.localhost/auth/login` | 401 Unauthorized | 1 | Expected — invalid credentials test |

No unexpected JavaScript runtime crashes were observed outside the Calendar error boundary.

---

## Recommended Fix Priority

### P0 — This Week

1. **Fix admin Calendar** — replace `eventHref` function prop with `eventHrefPrefix` string
2. **Fix currency hydration** — pre-compute `Intl` options server-side in `lib/geo/currencies.ts`
3. **Seed platform admin** — run `npm run db:seed` so platform admin can be tested

### P1 — Next Sprint

4. Humanize Zod validation messages on registration and forms
5. Humanize activity log (labels, resolved names, consistent date formatting)
6. Fix billing duplicate React keys in bank dropdown
7. Add `notFound()` for invalid resource IDs (courses, etc.)
8. Configure `S3_PUBLIC_BASE_URL` for resource thumbnails

### P2 — Polish

9. Consistent "Learners" terminology across admin UI
10. Markdown rendering in lesson bodies
11. Mobile card layout for admin data tables
12. Template type display labels
13. Remove redundant tenant/user queries from admin layout

---

## Test Coverage Summary

| Category | Pages Tested | Pages Working | Coverage |
|----------|-------------|---------------|----------|
| Marketing | 2 | 2 | 100% |
| Platform Admin | 1 (login only) | 0 (auth blocked) | ~5% |
| Tenant Admin | 23 | 22 | ~96% |
| Client Portal | 12 | 12 | 100% |
| Mobile | 5 key pages | 5 | Representative |
| **Total** | **~43** | **~36** | **~84%** |

### Not Tested (Out of Scope / Blocked)

- Platform admin pages (tenants, plans, analytics, users, settings, role templates)
- Full CRUD write operations (create/update/delete) — read-only visual testing only
- Payment gateway integration (Paystack / Flutterwave)
- Email delivery (SMTP)
- File upload flows (logo, thumbnail, resource upload)
- Auth flows: forgot password, reset password, change password, client registration
- Cross-browser testing (Chrome only via Playwright)
- Accessibility audit (WCAG)
- Performance / load testing
- Question Banks and Client Groups admin pages (not opened)

---

## Appendix: Environment & Routes

### Host Routing (via `proxy.ts`)

| Host | Purpose | Example |
|------|---------|---------|
| `localhost:3000` | Marketing (apex) | Landing, register |
| `platform.localhost:3000` | Platform admin | Tenants, plans |
| `{slug}.localhost:3000` | Tenant workspace | Admin + client portals |

### Demo Tenant

| Field | Value |
|-------|-------|
| Slug | `demo` |
| Display name | Greenfield Academy Lagos |
| Admin | `admin@demo.test` / `Password123!` |
| Instructor | `instructor@demo.test` / `Password123!` |
| Student | `rashida@demo.test` / `Password123!` |

### Seed Command

```bash
npm run db:seed:demo   # Demo tenant
npm run db:seed        # Platform admin + base data
```

---

*Report generated from live browser QA session on July 11, 2026.*
