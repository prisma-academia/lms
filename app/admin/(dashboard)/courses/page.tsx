import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CoursesTable } from "./courses-table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

/** "Free", or the price in the academy's locale. Never throws on an odd currency code. */
function priceLabel(cents: number | null, currency: string, locale: string): string {
  if (cents == null || cents === 0) return "Free";
  try {
    return new Intl.NumberFormat(locale || "en", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export default async function CoursesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_COURSES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key);
  const [courses, when] = await Promise.all([
    prisma.course.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        priceCents: true,
        currency: true,
        updatedAt: true,
        _count: { select: { lessons: true, enrollments: true } },
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = courses.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    status: c.status,
    priceCents: c.priceCents ?? 0,
    // Prices and dates are formatted here, in the academy's locale: the table
    // is a Client Component, and formatting there renders twice, differently.
    priceLabel: priceLabel(c.priceCents, c.currency, when.locale),
    lessonCount: c._count.lessons,
    enrollmentCount: c._count.enrollments,
    updatedAt: c.updatedAt.toISOString(),
    updatedLabel: formatDateTime(c.updatedAt, when),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Courses"
        description="Everything you teach. Open a course to edit its lessons, see who is enrolled and check progress."
        createHref={canWrite ? "/admin/courses/new" : undefined}
        createLabel="New course"
      />
      <CoursesTable
        data={rows}
        empty={
          <EmptyState
            icon="book"
            title="No courses yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/courses/new">Create a course</Link>
                </Button>
              ) : undefined
            }
          >
            Start with a title. You can write the lessons yourself or have the AI builder draft them.
          </EmptyState>
        }
      />
    </div>
  );
}
