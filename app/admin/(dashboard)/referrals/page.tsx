import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requestOrigin } from "@/lib/site/metadata";
import { formatDate } from "@/lib/format";
import { formatPrice } from "@/lib/site/public-format";
import { getReferralCode } from "@/lib/referrals/codes";
import {
  emptyTotals,
  referralTotals,
  referredLearners,
  type ReferralTotals,
} from "@/lib/referrals/stats";
import { PageHeader, Card } from "@/components/shell";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MyCodeCard } from "./my-code-card";
import { CodeToggle } from "./code-toggle";
import { tenantFormatContext } from "@/lib/tenant/format-context";

/**
 * Referrals: who each staff member has brought in.
 *
 * Every staff member sees this page and their own numbers — a code is personal
 * and needs no permission. Seeing everyone's codes, and switching them on and
 * off, are two separate permissions.
 */

const TH = "px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-3 align-top text-sm font-medium text-foreground";

export default async function ReferralsPage() {
  // No permission key: every signed-in staff member has their own code.
  const actor = await requireTenantPage();
  const tenantId = actor.tenantId;

  const canSeeAll = hasPermission(actor, PERMISSIONS.TENANT_REFERRALS_READ.key);
  const canManage = hasPermission(actor, PERMISSIONS.TENANT_REFERRALS_WRITE.key);
  const canSeeLearners = hasPermission(actor, PERMISSIONS.TENANT_CLIENTS_READ.key);

  const [mine, formatContext, origin] = await Promise.all([
    getReferralCode(tenantId, actor.userId),
    tenantFormatContext(tenantId),
    requestOrigin(),
  ]);

  const allCodes = canSeeAll
    ? await prisma.referralCode.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          active: true,
          tenantUser: { select: { firstName: true, lastName: true, email: true, status: true } },
        },
      })
    : [];

  const [totalsById, learners] = await Promise.all([
    referralTotals(tenantId, [...new Set([...(mine ? [mine.id] : []), ...allCodes.map((c) => c.id)])]),
    mine ? referredLearners(tenantId, mine.id) : Promise.resolve([]),
  ]);
  const myTotals: ReferralTotals = (mine && totalsById.get(mine.id)) || emptyTotals();

  // Dates and money are formatted here, once, on the server — never in a
  // Client Component, where the browser's locale would disagree with this one.
  const money = (totals: ReferralTotals): string =>
    totals.revenue.length === 0
      ? "—"
      : totals.revenue.map((r) => formatPrice(r.amountCents, r.currency, formatContext.locale)).join(" + ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Referrals"
        subtitle="Share links that carry your code, and see who signed up through them."
      />

      <MyCodeCard code={mine?.code ?? null} active={mine?.active ?? true} origin={origin.origin} />

      {mine ? (
        <>
          <section aria-labelledby="my-results" className="flex flex-col gap-3">
            <h2 id="my-results" className="font-heading text-lg leading-tight">
              Your results
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon="users" iconBg="var(--chart-1)" value={myTotals.signups} label="Sign-ups" />
              <StatCard icon="book" iconBg="var(--chart-2)" value={myTotals.enrollments} label="Enrolments" />
              <StatCard icon="credit-card" iconBg="var(--chart-3)" value={myTotals.purchases} label="Purchases" />
              <StatCard icon="trending-up" iconBg="var(--chart-4)" value={money(myTotals)} label="Revenue from purchases" />
            </div>
          </section>

          <section aria-labelledby="my-learners">
            <Card className="p-0">
              <div className="border-b-2 border-border px-5 py-4">
                <h2 id="my-learners" className="font-heading text-lg leading-tight">
                  Learners you referred
                </h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  People who created an account through your code, newest first.
                </p>
              </div>
              {learners.length === 0 ? (
                <EmptyState icon="users" title="Nobody yet">
                  When someone follows one of your links and signs up, they appear here.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse">
                    <caption className="sr-only">Learners who signed up through your code</caption>
                    <thead>
                      <tr className="border-b-2 border-border">
                        <th scope="col" className={TH}>Learner</th>
                        <th scope="col" className={TH}>Signed up</th>
                        <th scope="col" className={`${TH} text-right`}>Enrolments</th>
                        <th scope="col" className={`${TH} text-right`}>Purchases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {learners.map((learner) => {
                        // A learner's email is personal data: shown only to staff
                        // who could already see it on the Learners page.
                        const name = learner.name || (canSeeLearners ? learner.email : "Learner");
                        return (
                          <tr key={learner.id} className="border-b border-dashed border-border last:border-b-0">
                            <th scope="row" className={`${TD} text-left`}>
                              {canSeeLearners ? (
                                <Link
                                  href={`/admin/clients/${learner.id}`}
                                  className="font-bold underline decoration-primary decoration-2 underline-offset-4 hover:decoration-wavy"
                                >
                                  {name}
                                </Link>
                              ) : (
                                <span className="font-bold">{name}</span>
                              )}
                              {canSeeLearners && learner.name ? (
                                <span className="block text-xs font-medium text-muted-foreground">
                                  {learner.email}
                                </span>
                              ) : null}
                            </th>
                            <td className={`${TD} num whitespace-nowrap`}>
                              {formatDate(learner.referredAt, formatContext)}
                            </td>
                            <td className={`${TD} num text-right`}>{learner.enrollments}</td>
                            <td className={`${TD} num text-right`}>{learner.purchases}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>
        </>
      ) : null}

      {canSeeAll ? (
        <section aria-labelledby="all-codes">
          <Card className="p-0">
            <div className="border-b-2 border-border px-5 py-4">
              <h2 id="all-codes" className="font-heading text-lg leading-tight">
                All staff codes
              </h2>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Everyone in the team who has created a code, and what it has brought in.
              </p>
            </div>
            {allCodes.length === 0 ? (
              <EmptyState icon="users" title="No codes yet">
                Staff create their own code from this page. Once they do, it is listed here.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse">
                  <caption className="sr-only">Referral codes for every staff member</caption>
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th scope="col" className={TH}>Staff member</th>
                      <th scope="col" className={TH}>Code</th>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={`${TH} text-right`}>Sign-ups</th>
                      <th scope="col" className={`${TH} text-right`}>Enrolments</th>
                      <th scope="col" className={`${TH} text-right`}>Purchases</th>
                      <th scope="col" className={`${TH} text-right`}>Revenue</th>
                      {canManage ? (
                        <th scope="col" className={`${TH} text-right`}>
                          <span className="sr-only">Actions</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {allCodes.map((row) => {
                      const totals = totalsById.get(row.id) ?? emptyTotals();
                      const staffName =
                        [row.tenantUser.firstName, row.tenantUser.lastName].filter(Boolean).join(" ").trim() ||
                        row.tenantUser.email;
                      const left = row.tenantUser.status !== "ACTIVE";
                      return (
                        <tr key={row.id} className="border-b border-dashed border-border last:border-b-0">
                          <th scope="row" className={`${TD} text-left`}>
                            <span className="font-bold">{staffName}</span>
                            {row.id === mine?.id ? (
                              <span className="ml-1.5 text-xs font-bold text-muted-foreground">(you)</span>
                            ) : null}
                            <span className="block text-xs font-medium text-muted-foreground">
                              {row.tenantUser.email}
                            </span>
                          </th>
                          <td className={`${TD} num font-bold`}>{row.code}</td>
                          <td className={TD}>
                            {left ? (
                              <Badge color="var(--muted)">Account inactive</Badge>
                            ) : (
                              <Badge color={row.active ? "var(--success)" : "var(--muted)"}>
                                {row.active ? "Active" : "Switched off"}
                              </Badge>
                            )}
                          </td>
                          <td className={`${TD} num text-right`}>{totals.signups}</td>
                          <td className={`${TD} num text-right`}>{totals.enrollments}</td>
                          <td className={`${TD} num text-right`}>{totals.purchases}</td>
                          <td className={`${TD} num whitespace-nowrap text-right`}>{money(totals)}</td>
                          {canManage ? (
                            <td className={`${TD} text-right`}>
                              <CodeToggle id={row.id} active={row.active} staffName={staffName} />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
