"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { logAudit } from "@/lib/rbac";
import type { RoleName } from "@/generated/prisma/client";

export async function togglePermission(role: RoleName, permissionId: number, checked: boolean) {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") {
    throw new Error("이 작업은 ADMIN만 수행할 수 있습니다.");
  }
  // ADMIN 행은 애초에 만들지 않는다 — requirePermission()이 role만 보고 항상 통과시키므로
  // 이 테이블을 편집해도 ADMIN의 권한에는 영향을 줄 수 없다(자기잠금 방지, 이중 방어).
  if (role === "ADMIN") {
    throw new Error("ADMIN의 권한은 항상 전체 허용이며 편집할 수 없습니다.");
  }

  if (checked) {
    await prisma.rolePermission.upsert({
      where: { role_permissionId: { role, permissionId } },
      update: {},
      create: { role, permissionId },
    });
  } else {
    await prisma.rolePermission.deleteMany({ where: { role, permissionId } });
  }

  const permission = await prisma.permission.findUnique({ where: { id: permissionId } });
  await logAudit({
    actor,
    action: "PERMISSION_CHANGED",
    targetType: "RolePermission",
    targetId: `${role}:${permissionId}`,
    description: `${role} — ${permission?.key ?? permissionId} ${checked ? "부여" : "회수"}`,
  });

  revalidatePath("/permissions");
}
