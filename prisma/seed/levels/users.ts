import {
  ALL_TENANT_PERMISSION_KEYS,
  PERMISSIONS,
} from "../../../lib/auth/permissions";
import type { SeedContext } from "../index";
import { NG_GROUPS, NG_PEOPLE } from "../components/locale/ng";

export async function seedUsers(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, passwordHash } = ctx;

  const owner = await prisma.tenantUser.create({
    data: {
      tenantId,
      email: NG_PEOPLE.owner.email,
      firstName: NG_PEOPLE.owner.firstName,
      lastName: NG_PEOPLE.owner.lastName,
      passwordHash,
      mustChangePassword: false,
      isOwner: true,
      permissions: [...ALL_TENANT_PERMISSION_KEYS],
    },
  });
  ctx.ids.ownerId = owner.id;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { ownerUserId: owner.id },
  });

  const instructor = await prisma.tenantUser.create({
    data: {
      tenantId,
      email: NG_PEOPLE.instructor.email,
      firstName: NG_PEOPLE.instructor.firstName,
      lastName: NG_PEOPLE.instructor.lastName,
      passwordHash,
      mustChangePassword: false,
      isOwner: false,
      permissions: [
        PERMISSIONS.TENANT_COURSES_READ.key,
        PERMISSIONS.TENANT_COURSES_WRITE.key,
        PERMISSIONS.TENANT_ENROLLMENTS_READ.key,
        PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key,
        PERMISSIONS.TENANT_ASSIGNMENTS_READ.key,
        PERMISSIONS.TENANT_ASSIGNMENTS_WRITE.key,
        PERMISSIONS.TENANT_GRADES_READ.key,
        PERMISSIONS.TENANT_GRADES_WRITE.key,
        PERMISSIONS.TENANT_CLIENTS_READ.key,
        PERMISSIONS.TENANT_QUIZZES_READ.key,
        PERMISSIONS.TENANT_QUIZZES_WRITE.key,
      ],
    },
  });
  ctx.ids.instructorId = instructor.id;

  const userGroup = await prisma.userGroup.create({
    data: {
      tenantId,
      name: NG_GROUPS.userGroup.name,
      description: NG_GROUPS.userGroup.description,
    },
  });
  ctx.ids.userGroupId = userGroup.id;

  await prisma.tenantUserGroupMembership.create({
    data: {
      tenantId,
      groupId: userGroup.id,
      userId: instructor.id,
    },
  });

  const clientGroup = await prisma.clientGroup.create({
    data: {
      tenantId,
      name: NG_GROUPS.clientGroup.name,
      description: NG_GROUPS.clientGroup.description,
    },
  });
  ctx.ids.clientGroupId = clientGroup.id;

  const student = await prisma.client.create({
    data: {
      tenantId,
      email: NG_PEOPLE.student.email,
      firstName: NG_PEOPLE.student.firstName,
      lastName: NG_PEOPLE.student.lastName,
      passwordHash,
      mustChangePassword: false,
      profileJson: {
        name: `${NG_PEOPLE.student.firstName} ${NG_PEOPLE.student.lastName}`,
        state: "Lagos",
      } as object,
    },
  });
  ctx.ids.clientId = student.id;

  await prisma.clientGroupMembership.create({
    data: {
      tenantId,
      groupId: clientGroup.id,
      clientId: student.id,
    },
  });

  for (const extra of NG_PEOPLE.extraClients) {
    const c = await prisma.client.create({
      data: {
        tenantId,
        email: extra.email,
        firstName: extra.firstName,
        lastName: extra.lastName,
        passwordHash,
        mustChangePassword: false,
      },
    });
    await prisma.clientGroupMembership.create({
      data: { tenantId, groupId: clientGroup.id, clientId: c.id },
    });
  }
}
