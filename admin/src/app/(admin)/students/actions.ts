"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { StudentGrade, StudentStatus } from "@/generated/prisma/client";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function createStudent(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const grade = String(formData.get("grade") ?? "GENERAL") as StudentGrade;
  const status = String(formData.get("status") ?? "ACTIVE") as StudentStatus;
  const discountRate = Number(formData.get("discountRate") ?? 0);

  if (!name || !loginId || !password) {
    return { error: "이름, 로그인 ID, 비밀번호는 필수입니다." };
  }

  const existing = await prisma.student.findUnique({ where: { loginId } });
  if (existing) {
    return { error: "이미 사용 중인 로그인 ID입니다." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.student.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      name,
      loginId,
      passwordHash,
      grade,
      status,
      discountRate,
    },
  });

  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const grade = String(formData.get("grade") ?? "GENERAL") as StudentGrade;
  const status = String(formData.get("status") ?? "ACTIVE") as StudentStatus;
  const discountRate = Number(formData.get("discountRate") ?? 0);
  const points = Number(formData.get("points") ?? 0);
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!name) {
    return { error: "이름은 필수입니다." };
  }

  await prisma.student.update({
    where: { id },
    data: {
      name,
      grade,
      status,
      discountRate,
      points,
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect("/students");
}

export async function deleteStudent(id: number) {
  await requireAuth();
  await prisma.student.delete({ where: { id } });
  revalidatePath("/students");
}
