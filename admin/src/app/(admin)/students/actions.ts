"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { startStudentImpersonation, stopStudentImpersonation } from "@/lib/studentAuth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { AccountStatus, StudentGrade, StudentStatus, Sex, ResidenceRegion } from "@/generated/prisma/client";

export async function createStudent(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.create");

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

  const student = await prisma.student.create({
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
  await logAudit({ actor, action: "ACCOUNT_CREATED", targetType: "Student", targetId: student.id, description: `학생 등록: ${name}` });

  revalidatePath("/students");
  redirect("/students");
}

export async function updateStudent(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");

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
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: id, description: newPassword ? "학생 정보 수정(비밀번호 변경 포함)" : "학생 정보 수정" });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect("/students");
}

// 학생에게 수강내역·레벨테스트·상담노트 등 연결 데이터가 있을 수 있어 실제로 지우지
// 않고 deletedAt만 채운다(소프트 삭제). 목록은 deletedAt: null만 조회한다.
export async function deleteStudent(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.delete");
  await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit({ actor, action: "DELETE", targetType: "Student", targetId: id, description: "학생 삭제(소프트)" });
  revalidatePath("/students");
}

export async function restoreStudent(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.delete");
  await prisma.student.update({ where: { id }, data: { deletedAt: null } });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: id, description: "학생 삭제 취소(복원)" });
  revalidatePath("/students");
}

export async function updateStudentAgent(id: number, agentId: number | null) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");
  await prisma.student.update({ where: { id }, data: { agentId } });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: id, description: "협력사 변경" });
  revalidatePath("/students");
}

export async function updateStudentGrade(id: number, grade: StudentGrade) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");
  await prisma.student.update({ where: { id }, data: { grade } });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: id, description: `회원등급 변경: ${grade}` });
  revalidatePath("/students");
}

export async function updateStudentAccountStatus(id: number, accountStatus: AccountStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");
  await prisma.student.update({ where: { id }, data: { accountStatus } });
  await logAudit({
    actor,
    action: accountStatus === "ACTIVE" ? "UPDATE" : "ACCOUNT_DISABLED",
    targetType: "Student",
    targetId: id,
    description: `계정 상태 변경: ${accountStatus}`,
  });
  revalidatePath("/students");
}

export async function addConsultationNote(studentId: number, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  await prisma.consultationNote.create({
    data: { studentId, content },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: studentId, description: "상담노트 작성" });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function updateConsultationNote(studentId: number, noteId: number, content: string) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");
  const trimmed = content.trim();
  if (!trimmed) return;

  await prisma.consultationNote.update({ where: { id: noteId }, data: { content: trimmed } });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: studentId, description: "상담노트 수정" });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

export async function deleteConsultationNote(studentId: number, noteId: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.update");
  await prisma.consultationNote.delete({ where: { id: noteId } });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: studentId, description: "상담노트 삭제" });
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

// 관리자가 학생 계정 화면을 그대로 확인하기 위한 대리 로그인. 관리자 세션은 유지되므로
// 학생 화면 배너의 "관리자로 돌아가기"로 즉시 복귀할 수 있다. students.update와 분리된
// 별도 권한(students.impersonate)으로 게이트하며, 기본 시드는 ADMIN만 보유한다.
export async function impersonateStudent(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.impersonate");
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.deletedAt) {
    throw new Error("대리 로그인할 수 없는 학생입니다.");
  }
  await startStudentImpersonation(id);
  await logAudit({ actor, action: "IMPERSONATION_STARTED", targetType: "Student", targetId: id, description: `${actor.name}이(가) 학생 ${student.name}(${student.loginId})으로 대리 로그인 시작` });
  redirect("/student");
}

export async function endImpersonation() {
  const actor = await requireBackofficeActor();
  await stopStudentImpersonation();
  await logAudit({ actor, action: "IMPERSONATION_ENDED", targetType: "Student", description: `${actor.name}이(가) 대리 로그인 종료` });
  redirect("/students");
}
