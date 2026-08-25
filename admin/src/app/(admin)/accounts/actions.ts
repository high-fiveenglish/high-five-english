"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { AccountStatus, RoleName } from "@/generated/prisma/client";

// 계정관리/권한관리/Audit Log는 권한 테이블을 거치지 않고 role === "ADMIN"을 직접
// 확인한다 — 권한 테이블을 잘못 편집해 MANAGER가 관리자 계정을 만들 수 있게 되는
// 자기-상승 구멍을 원천 차단하기 위함(설계 요구사항).
async function requireAdminRole() {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") {
    throw new Error("이 작업은 ADMIN만 수행할 수 있습니다.");
  }
  return actor;
}

export async function createAccount(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireAdminRole();

  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "MANAGER") as RoleName;

  if (!loginId || !password || !name) {
    return { error: "아이디, 비밀번호, 이름은 필수입니다." };
  }
  if (role !== "ADMIN" && role !== "MANAGER") {
    return { error: "역할은 ADMIN 또는 MANAGER만 가능합니다." };
  }

  const existing = await prisma.adminUser.findUnique({ where: { loginId } });
  if (existing) {
    return { error: "이미 사용 중인 아이디입니다." };
  }

  const user = await prisma.adminUser.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      loginId,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      role,
    },
  });
  await logAudit({ actor, action: "ACCOUNT_CREATED", targetType: "AdminUser", targetId: user.id, description: `${role} 계정 생성: ${loginId}` });

  revalidatePath("/accounts");
  redirect("/accounts");
}

// 시스템에 ADMIN이 한 명도 남지 않는 상황(자기잠금)을 막기 위해, 마지막 남은 활성
// ADMIN의 역할/상태를 변경하려는 시도는 거부한다.
async function assertNotLastActiveAdmin(targetId: number) {
  const activeAdminCount = await prisma.adminUser.count({ where: { role: "ADMIN", status: "ACTIVE" } });
  const target = await prisma.adminUser.findUnique({ where: { id: targetId } });
  if (target?.role === "ADMIN" && target.status === "ACTIVE" && activeAdminCount <= 1) {
    throw new Error("마지막 남은 ADMIN 계정은 역할/상태를 변경할 수 없습니다.");
  }
}

export async function updateAccountRole(id: number, role: RoleName) {
  const actor = await requireAdminRole();
  if (role !== "ADMIN" && role !== "MANAGER") {
    throw new Error("역할은 ADMIN 또는 MANAGER만 가능합니다.");
  }
  if (role !== "ADMIN") {
    await assertNotLastActiveAdmin(id);
  }
  await prisma.adminUser.update({ where: { id }, data: { role } });
  await logAudit({ actor, action: "ROLE_CHANGED", targetType: "AdminUser", targetId: id, description: `역할 변경: ${role}` });
  revalidatePath("/accounts");
}

export async function updateAccountStatus(id: number, status: AccountStatus) {
  const actor = await requireAdminRole();
  if (status !== "ACTIVE") {
    await assertNotLastActiveAdmin(id);
  }
  await prisma.adminUser.update({ where: { id }, data: { status } });
  await logAudit({
    actor,
    action: status === "ACTIVE" ? "UPDATE" : "ACCOUNT_DISABLED",
    targetType: "AdminUser",
    targetId: id,
    description: `상태 변경: ${status}`,
  });
  revalidatePath("/accounts");
}
