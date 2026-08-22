"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { ApprovalStatus, Sex, TeacherGrade } from "@/generated/prisma/client";

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

  const teacherGrade = String(formData.get("teacherGrade") ?? "GENERAL") as TeacherGrade;
  const teamLeaderIdRaw = String(formData.get("teamLeaderId") ?? "");
  const sexRaw = String(formData.get("sex") ?? "");
  const ageRaw = String(formData.get("age") ?? "");
  const schoolName = String(formData.get("schoolName") ?? "").trim();
  const major = String(formData.get("major") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const availableTimeText = String(formData.get("availableTimeText") ?? "").trim();
  const availableHours = formData.getAll("availableHours").map((h) => Number(h));
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const zoomUrl = String(formData.get("zoomUrl") ?? "").trim();
  const zoomPw = String(formData.get("zoomPw") ?? "").trim();
  const tencentUrl = String(formData.get("tencentUrl") ?? "").trim();
  const experience = String(formData.get("experience") ?? "").trim();
  const selfIntroduction = String(formData.get("selfIntroduction") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "") || null;
  const voiceUrl = String(formData.get("voiceUrl") ?? "") || null;
  const videoYoutubeCode = String(formData.get("videoYoutubeCode") ?? "").trim();
  const tesol = formData.get("tesol") === "on";
  const priority = Number(formData.get("priority") ?? 0);

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
      teacherGrade,
      teamLeaderId: teamLeaderIdRaw ? Number(teamLeaderIdRaw) : null,
      sex: sexRaw ? (sexRaw as Sex) : null,
      age: ageRaw ? Number(ageRaw) : null,
      schoolName: schoolName || null,
      major: major || null,
      address: address || null,
      availableTimeText: availableTimeText || null,
      availableHours,
      mobilePhone: mobilePhone || null,
      teamsId: teamsId || null,
      zoomUrl: zoomUrl || null,
      zoomPw: zoomPw || null,
      tencentUrl: tencentUrl || null,
      experience: experience || null,
      selfIntroduction: selfIntroduction || null,
      photoUrl,
      voiceUrl,
      videoYoutubeCode: videoYoutubeCode || null,
      tesol,
      priority,
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
