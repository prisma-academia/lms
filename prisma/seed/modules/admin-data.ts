import { DAY, type SeedContext } from "../index";
import { NG_LOCALE } from "../components/locale/ng";
import { FEE_CATALOG } from "../components/catalogs/fees";
import {
  ACTIVITY_CATALOG,
  LIBRARY_CATALOG,
  TEMPLATE_CATALOG,
} from "../components/catalogs/library";

export async function seedAdminData(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;
  const clientGroupId = ctx.ids.clientGroupId;
  const instructorId = ctx.ids.instructorId;
  const ownerId = ctx.ids.ownerId;

  for (const f of FEE_CATALOG) {
    const fee = await prisma.fee.create({
      data: {
        tenantId,
        name: f.name,
        description: f.description,
        amountCents: f.amountCents,
        currency: NG_LOCALE.currency,
        dueAt: new Date(now + f.dueInDays * DAY),
        clientId: f.target === "client" ? clientId : null,
        clientGroupId: f.target === "clientGroup" ? clientGroupId : null,
      },
    });

    if (f.studentPaid) {
      await prisma.feePayment.create({
        data: {
          tenantId,
          feeId: fee.id,
          clientId,
          amountCents: f.amountCents,
          currency: NG_LOCALE.currency,
          status: "SUCCESS",
          method: "bank_transfer",
          paidAt: new Date(now - 3 * DAY),
          note: "Paid via GTBank transfer",
        },
      });
    }
  }

  const groupByPath = new Map<string, string>();

  async function ensureGroup(path: string[]): Promise<string> {
    const key = path.join("/");
    const existing = groupByPath.get(key);
    if (existing) return existing;

    let parentId: string | null = null;
    if (path.length > 1) {
      parentId = await ensureGroup(path.slice(0, -1));
    }

    const group = await prisma.libraryFolder.create({
      data: {
        tenantId,
        name: path[path.length - 1],
        parentId,
        sortOrder: path.length - 1,
      },
    });
    groupByPath.set(key, group.id);
    return group.id;
  }

  const tagIds = new Map<string, string>();
  for (const r of LIBRARY_CATALOG) {
    const parentId =
      r.folderPath.length > 0 ? await ensureGroup(r.folderPath) : null;

    const key = `demo/${tenantId}/${r.name.replace(/\s+/g, "-").toLowerCase()}`;
    const item = await prisma.libraryItem.create({
      data: {
        tenantId,
        name: r.name,
        key,
        contentType: r.contentType,
        sizeBytes: BigInt(r.sizeBytes),
        folderId: parentId,
        createdById: instructorId,
      },
    });

    for (const tagName of r.tags) {
      let tagId = tagIds.get(tagName);
      if (!tagId) {
        const tag = await prisma.libraryTag.upsert({
          where: { tenantId_name: { tenantId, name: tagName } },
          create: { tenantId, name: tagName },
          update: {},
        });
        tagId = tag.id;
        tagIds.set(tagName, tagId);
      }
      await prisma.libraryItemTag.create({
        data: { tenantId, itemId: item.id, tagId },
      });
    }
  }

  for (const t of TEMPLATE_CATALOG) {
    await prisma.template.create({
      data: {
        tenantId,
        type: t.type,
        name: t.name,
        contentJson: t.contentJson as object,
      },
    });
  }

  for (const a of ACTIVITY_CATALOG) {
    await prisma.activityLog.create({
      data: {
        tenantId,
        actorType: "TENANT_USER",
        actorId: a.action.includes("grade") ? instructorId : ownerId,
        action: a.action,
        targetType: a.targetType ?? null,
        createdAt: new Date(now - a.daysAgo * DAY),
      },
    });
  }
}
