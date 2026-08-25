"use server";

import { redirect } from "next/navigation";
import { createStudentSession, verifyStudentLogin } from "@/lib/studentAuth";
import { logAudit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function studentLogin(_prevState: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginId || !password) {
    return { error: "아이디와 비밀번호를 입력해주세요." };
  }

  const studentId = await verifyStudentLogin(loginId, password);
  if (!studentId) {
    await logAudit({ actor: null, action: "LOGIN_FAILED", description: `학생 로그인 실패: ${loginId}` });
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  await createStudentSession(studentId);
  const student = await prisma.student.update({ where: { id: studentId }, data: { lastLoginAt: new Date() } });
  await logAudit({ actor: { role: "STUDENT", id: student.id, name: student.name }, action: "LOGIN_SUCCESS" });
  redirect("/student");
}
