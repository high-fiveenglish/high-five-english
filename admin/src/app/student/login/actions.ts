"use server";

import { redirect } from "next/navigation";
import { createStudentSession, verifyStudentLogin } from "@/lib/studentAuth";

export async function studentLogin(_prevState: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginId || !password) {
    return { error: "아이디와 비밀번호를 입력해주세요." };
  }

  const studentId = await verifyStudentLogin(loginId, password);
  if (!studentId) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  await createStudentSession(studentId);
  redirect("/student");
}
