"use server";

import { redirect } from "next/navigation";
import { createSession, verifyLogin } from "@/lib/auth";

export async function login(_prevState: { error?: string } | undefined, formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!verifyLogin(id, password)) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  await createSession();
  redirect("/");
}
