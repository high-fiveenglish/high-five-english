"use server";

import { redirect } from "next/navigation";
import { createTeacherSession, verifyTeacherLogin } from "@/lib/teacherAuth";
import { logAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function teacherLogin(_prevState: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginId || !password) {
    return { error: "Please enter your login ID and password." };
  }

  const teacherId = await verifyTeacherLogin(loginId, password);
  if (!teacherId) {
    await logAudit({ actor: null, action: "LOGIN_FAILED", description: `강사 로그인 실패: ${loginId}` });
    return { error: "Incorrect login ID or password." };
  }

  await createTeacherSession(teacherId);
  const teacher = await prisma.teacher.update({ where: { id: teacherId }, data: { lastLoginAt: new Date() } });
  await logAudit({ actor: { role: "TEACHER", id: teacher.id, name: teacher.realName }, action: "LOGIN_SUCCESS" });
  redirect("/teacher");
}
