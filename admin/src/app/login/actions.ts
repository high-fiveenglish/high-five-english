"use server";

import { redirect } from "next/navigation";
import { createBackofficeSession, verifyBackofficeLogin } from "@/lib/backofficeAuth";
import { logAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  const adminUserId = await verifyBackofficeLogin(id, password);
  if (!adminUserId) {
    await logAudit({ actor: null, action: "LOGIN_FAILED", description: `로그인 실패: ${id}` });
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  await createBackofficeSession(adminUserId);
  const user = await prisma.adminUser.update({ where: { id: adminUserId }, data: { lastLoginAt: new Date() } });
  await logAudit({ actor: { role: user.role, id: user.id, name: user.name }, action: "LOGIN_SUCCESS" });
  redirect("/");
}
