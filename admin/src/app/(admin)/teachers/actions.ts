"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { ApprovalStatus } from "@/generated/prisma/client";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

export async function createTeacher(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const realName = String(formData.get("realName") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nationality = String(formData.get("nationality") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const ratePerUnit = Number(formData.get("ratePerUnit") ?? 0);

  if (!realName || !loginId || !password) {
    return { error: "실명, 로그인 ID, 비밀번호는 필수입니다." };
  }

  const existing = await prisma.teacher.findUnique({ where: { loginId } });
  if (existing) {
    return { error: "이미 사용 중인 로그인 ID입니다." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.teacher.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      realName,
      nickname: nickname || null,
      loginId,
      passwordHash,
      nationality: nationality || null,
      email: email || null,
      rates: ratePerUnit
        ? {
            create: { ratePerUnit, unitMinutes: 25, effectiveFrom: new Date() },
          }
        : undefined,
    },
  });

  revalidatePath("/teachers");
  redirect("/teachers");
}

export async function updateTeacher(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();

  const realName = String(formData.get("realName") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const nationality = String(formData.get("nationality") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const approvalStatus = String(formData.get("approvalStatus") ?? "PENDING") as ApprovalStatus;
  const newPassword = String(formData.get("newPassword") ?? "");
  const newRatePerUnit = Number(formData.get("newRatePerUnit") ?? 0);

  if (!realName) {
    return { error: "실명은 필수입니다." };
  }

  await prisma.teacher.update({
    where: { id },
    data: {
      realName,
      nickname: nickname || null,
      nationality: nationality || null,
      email: email || null,
      approvalStatus,
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
      ...(newRatePerUnit
        ? { rates: { create: { ratePerUnit: newRatePerUnit, unitMinutes: 25, effectiveFrom: new Date() } } }
        : {}),
    },
  });

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${id}`);
  redirect("/teachers");
}

export async function deleteTeacher(id: number) {
  await requireAuth();
  await prisma.teacher.delete({ where: { id } });
  revalidatePath("/teachers");
}
