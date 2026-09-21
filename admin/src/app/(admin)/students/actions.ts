"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { startStudentImpersonation, stopStudentImpersonation } from "@/lib/studentAuth";
import { createSsoToken } from "@/lib/sso";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";
import type { StudentGrade, StudentStatus, Sex, ResidenceRegion, ConsultRoute } from "@/generated/prisma/client";

// 회원등급이 GENERAL(일반회원)이고 협력사를 명시적으로 고르지 않았다면 직영에이전트를
// 기본값으로 채운다. 다른 등급이거나 협력사를 명시적으로 골랐다면 그 값을 그대로 쓴다.
async function resolveAgentId(grade: StudentGrade, agentIdRaw: string): Promise<number | null> {
  if (agentIdRaw) return Number(agentIdRaw);
  if (grade !== "GENERAL") return null;
  const highfive = await prisma.agent.findUnique({ where: { code: HIGHFIVE_AGENT_CODE } });
  return highfive?.id ?? null;
}

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
  const consultRouteRaw = String(formData.get("consultRoute") ?? "");

  const englishName = String(formData.get("englishName") ?? "").trim();
  const sexRaw = String(formData.get("sex") ?? "");
  const birthDateRaw = String(formData.get("birthDate") ?? "");
  const occupation = String(formData.get("occupation") ?? "").trim();
  const regionRaw = String(formData.get("region") ?? "");
  const address = String(formData.get("address") ?? "").trim();
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const etcNote = String(formData.get("etcNote") ?? "").trim();
  const preferredClassMethod = String(formData.get("preferredClassMethod") ?? "").trim();
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const kakaoId = String(formData.get("kakaoId") ?? "").trim();
  const wechatId = String(formData.get("wechatId") ?? "").trim();
  const referrerId = String(formData.get("referrerId") ?? "").trim();

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
      agentId: await resolveAgentId(grade, agentIdRaw),
      consultRoute: consultRouteRaw ? (consultRouteRaw as ConsultRoute) : null,
      englishName: englishName || null,
      sex: sexRaw ? (sexRaw as Sex) : null,
      birthDate: birthDateRaw ? new Date(birthDateRaw) : null,
      occupation: occupation || null,
      region: regionRaw ? (regionRaw as ResidenceRegion) : null,
      address: address || null,
      mobilePhone: mobilePhone || null,
      etcNote: etcNote || null,
      preferredClassMethod: preferredClassMethod || null,
      teamsId: teamsId || null,
      kakaoId: kakaoId || null,
      wechatId: wechatId || null,
      referrerId: referrerId || null,
    },
  });
  await logAudit({ actor, action: "ACCOUNT_CREATED", targetType: "Student", targetId: student.id, description: `학생 등록: ${name}` });

  revalidatePath("/students");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
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
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const etcNote = String(formData.get("etcNote") ?? "").trim();
  const preferredClassMethod = String(formData.get("preferredClassMethod") ?? "").trim();
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const kakaoId = String(formData.get("kakaoId") ?? "").trim();
  const wechatId = String(formData.get("wechatId") ?? "").trim();
  const consultRouteRaw = String(formData.get("consultRoute") ?? "");
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
      mobilePhone: mobilePhone || null,
      etcNote: etcNote || null,
      preferredClassMethod: preferredClassMethod || null,
      teamsId: teamsId || null,
      kakaoId: kakaoId || null,
      wechatId: wechatId || null,
      consultRoute: consultRouteRaw ? (consultRouteRaw as ConsultRoute) : null,
      referrerId: referrerId || null,
      agentId: await resolveAgentId(grade, agentIdRaw),
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "Student", targetId: id, description: newPassword ? "학생 정보 수정(비밀번호 변경 포함)" : "학생 정보 수정" });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  syncTeacherScheduleToGoogleSheet().catch(() => {});
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

// 관리자가 학생 계정 화면을 그대로 확인하기 위한 대리 로그인. 실제 학생이 보는 화면은
// admin이 아니라 메인 마케팅 사이트(Vite, 별도 origin·별도 mock 데이터)의 "내 강의실"이므로,
// 서명된 1회용 SSO 토큰을 발급해 그쪽 /sso 진입 라우트로 이동시킨다(sso.ts/verify 라우트
// 참고). admin 쪽 student_session 쿠키도 함께 발급해두는데, 이건 admin 자체의 /student
// 화면(레거시 폴백)과 endImpersonation()의 "돌아가기" 흐름이 계속 동작하도록 남겨둔
// 것으로, 실제 이동 목적지와는 별개다. students.update와 분리된 별도 권한
// (students.impersonate)으로 게이트하며, 기본 시드는 ADMIN만 보유한다.
export async function impersonateStudent(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "students.impersonate");
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.deletedAt) {
    throw new Error("대리 로그인할 수 없는 학생입니다.");
  }
  await startStudentImpersonation(id);
  await logAudit({ actor, action: "IMPERSONATION_STARTED", targetType: "Student", targetId: id, description: `${actor.name}이(가) 학생 ${student.name}(${student.loginId})으로 대리 로그인 시작` });

  const token = createSsoToken({
    studentId: student.id,
    loginId: student.loginId,
    name: student.name,
    englishName: student.englishName,
  });
  const marketingSiteUrl = process.env.MARKETING_SITE_URL ?? "http://localhost:5173";
  redirect(`${marketingSiteUrl}/sso?token=${encodeURIComponent(token)}`);
}

export async function endImpersonation() {
  const actor = await requireBackofficeActor();
  await stopStudentImpersonation();
  await logAudit({ actor, action: "IMPERSONATION_ENDED", targetType: "Student", description: `${actor.name}이(가) 대리 로그인 종료` });
  redirect("/students");
}
