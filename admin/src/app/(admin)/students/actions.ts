"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { startStudentImpersonation, stopStudentImpersonation } from "@/lib/studentAuth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { StudentGrade, StudentStatus, Sex, ResidenceRegion } from "@/generated/prisma/client";

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
  const agentIdRaw = String(formData.get("agentId") ?? "");

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
      agentId: agentIdRaw ? Number(agentIdRaw) : null,
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

  const englishName = String(formData.get("englishName") ?? "").trim();
  const sexRaw = String(formData.get("sex") ?? "");
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const occupation = String(formData.get("occupation") ?? "").trim();
  const regionRaw = String(formData.get("region") ?? "");
  const address = String(formData.get("address") ?? "").trim();
  const landlinePhone = String(formData.get("landlinePhone") ?? "").trim();
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const etcNote = String(formData.get("etcNote") ?? "").trim();
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentContact = String(formData.get("parentContact") ?? "").trim();
  const preferredClassMethod = String(formData.get("preferredClassMethod") ?? "").trim();
  const smsOptIn = formData.get("smsOptIn") === "on";
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const referrerId = String(formData.get("referrerId") ?? "").trim();
  const agentIdRaw = String(formData.get("agentId") ?? "");

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
      englishName: englishName || null,
      sex: sexRaw ? (sexRaw as Sex) : null,
      birthDate: birthDateRaw ? new Date(birthDateRaw) : null,
      occupation: occupation || null,
      region: regionRaw ? (regionRaw as ResidenceRegion) : null,
      address: address || null,
      landlinePhone: landlinePhone || null,
      mobilePhone: mobilePhone || null,
      etcNote: etcNote || null,
      parentName: parentName || null,
      parentContact: parentContact || null,
      preferredClassMethod: preferredClassMethod || null,
      smsOptIn,
      teamsId: teamsId || null,
      referrerId: referrerId || null,
      agentId: agentIdRaw ? Number(agentIdRaw) : null,
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect("/students");
}

// 학생에게 수강내역·레벨테스트·상담노트 등 연결 데이터가 있을 수 있어 실제로 지우지
// 않고 deletedAt만 채운다(소프트 삭제). 목록은 deletedAt: null만 조회한다.
export async function deleteStudent(id: number) {
  await requireAuth();
  await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/students");
}

export async function restoreStudent(id: number) {
  await requireAuth();
  await prisma.student.update({ where: { id }, data: { deletedAt: null } });
  revalidatePath("/students");
}

export async function updateStudentAgent(id: number, agentId: number | null) {
  await requireAuth();
  await prisma.student.update({ where: { id }, data: { agentId } });
  revalidatePath("/students");
}

export async function updateStudentGrade(id: number, grade: StudentGrade) {
  await requireAuth();
  await prisma.student.update({ where: { id }, data: { grade } });
  revalidatePath("/students");
}

export async function addConsultationNote(studentId: number, formData: FormData) {
  await requireAuth();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  await prisma.consultationNote.create({
    data: { studentId, content },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function updateConsultationNote(studentId: number, noteId: number, content: string) {
  await requireAuth();
  const trimmed = content.trim();
  if (!trimmed) return;

  await prisma.consultationNote.update({ where: { id: noteId }, data: { content: trimmed } });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function deleteConsultationNote(studentId: number, noteId: number) {
  await requireAuth();
  await prisma.consultationNote.delete({ where: { id: noteId } });
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

// 관리자가 학생 계정 화면을 그대로 확인하기 위한 대리 로그인. 관리자 세션은 유지되므로
// 학생 화면 배너의 "관리자로 돌아가기"로 즉시 복귀할 수 있다.
export async function impersonateStudent(id: number) {
  await requireAuth();
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.deletedAt) {
    throw new Error("대리 로그인할 수 없는 학생입니다.");
  }
  await startStudentImpersonation(id);
  redirect("/student");
}

export async function endImpersonation() {
  await stopStudentImpersonation();
  redirect("/students");
}
