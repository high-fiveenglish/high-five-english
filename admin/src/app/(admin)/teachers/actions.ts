"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { startTeacherImpersonation, stopTeacherImpersonation } from "@/lib/teacherAuth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import type { AccountStatus, ApprovalStatus, Sex, TeacherGrade } from "@/generated/prisma/client";

export async function createTeacher(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.create");

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

  const teacher = await prisma.teacher.create({
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
  await logAudit({ actor, action: "ACCOUNT_CREATED", targetType: "Teacher", targetId: teacher.id, description: `강사 등록: ${realName}` });

  revalidatePath("/teachers");
  redirect("/teachers");
}

export async function updateTeacher(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.update");

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
  const availableHours = formData.getAll("availableHours").map((h) => Number(h));
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const teamsUrl = String(formData.get("teamsUrl") ?? "").trim();
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
      availableHours,
      mobilePhone: mobilePhone || null,
      teamsId: teamsId || null,
      teamsUrl: teamsUrl || null,
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
  await logAudit({ actor, action: "UPDATE", targetType: "Teacher", targetId: id, description: newPassword ? "강사 정보 수정(비밀번호 변경 포함)" : "강사 정보 수정" });

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${id}`);
  redirect("/teachers");
}

// 수업/평가/급여 이력 등 연결 데이터가 있을 수 있어 실제로 지우지 않고 accountStatus를
// INACTIVE로 바꾸는 소프트 비활성화로 처리한다(하드 삭제 금지 — 이전에는 prisma.teacher.delete였음).
export async function deleteTeacher(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.delete");
  await prisma.teacher.update({ where: { id }, data: { accountStatus: "INACTIVE" } });
  await logAudit({ actor, action: "ACCOUNT_DISABLED", targetType: "Teacher", targetId: id, description: "강사 비활성화" });
  revalidatePath("/teachers");
}

// 관리자(매니저)가 강사 계정 화면을 그대로 확인하기 위한 대리 로그인. 강사 대시보드는
// 학생용과 달리 admin과 같은 Next.js 앱 안에 있으므로(admin/src/app/teacher/(dashboard)),
// 별도 SSO 브릿지 없이 teacher_session 쿠키만 추가로 발급하고 같은 앱 내에서 이동한다.
// admin_session은 그대로 남아있어 강사 화면에서 바로 관리자로 돌아올 수 있다.
export async function impersonateTeacher(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.impersonate");
  const teacher = await prisma.teacher.findUnique({ where: { id } });
  if (!teacher || teacher.accountStatus !== "ACTIVE") {
    throw new Error("대리 로그인할 수 없는 강사입니다.");
  }
  await startTeacherImpersonation(id);
  await logAudit({ actor, action: "IMPERSONATION_STARTED", targetType: "Teacher", targetId: id, description: `${actor.name}이(가) 강사 ${teacher.realName}(${teacher.loginId})으로 대리 로그인 시작` });
  redirect("/teacher");
}

export async function endTeacherImpersonation() {
  const actor = await requireBackofficeActor();
  await stopTeacherImpersonation();
  await logAudit({ actor, action: "IMPERSONATION_ENDED", targetType: "Teacher", description: `${actor.name}이(가) 강사 대리 로그인 종료` });
  redirect("/teachers");
}

// 비활성/정지 강사 목록에서 여러 명을 골라 완전히(하드) 삭제한다 — 위 deleteTeacher의
// 소프트 비활성화와 달리, 이건 관리자가 "테스트/더 이상 안 쓰는 계정이라 정말 지워도
// 된다"고 명시적으로 확인한 경우에만 쓰는 별도 기능이다. 강사와 연결된 수강내역
// (Enrollment)·그 수강내역의 수업/휴강/월평가서까지 전부 함께 지워지므로 되돌릴 수
// 없다 — 이미 비활성 상태인 강사만 대상으로 한다(활성 강사를 실수로 지우는 걸 막기 위해).
export async function bulkHardDeleteTeachers(ids: number[]) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.delete");
  if (ids.length === 0) return;

  const teachers = await prisma.teacher.findMany({
    where: { id: { in: ids }, accountStatus: { not: "ACTIVE" } },
    select: { id: true, realName: true },
  });
  const teacherIds = teachers.map((t) => t.id);
  if (teacherIds.length === 0) return;

  const enrollments = await prisma.enrollment.findMany({ where: { teacherId: { in: teacherIds } }, select: { id: true } });
  const enrollmentIds = enrollments.map((e) => e.id);
  const sessions = await prisma.classSession.findMany({ where: { enrollmentId: { in: enrollmentIds } }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await tx.monthlyEvaluation.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await tx.lessonEvaluation.deleteMany({ where: { classSessionId: { in: sessionIds } } });
    await tx.classSession.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await tx.monthlyEvaluation.updateMany({
      where: { teacherId: { in: teacherIds }, enrollmentId: { notIn: enrollmentIds } },
      data: { teacherId: null },
    });
    await tx.levelTest.updateMany({ where: { teacherId: { in: teacherIds } }, data: { teacherId: null } });
    await tx.teacher.updateMany({ where: { teamLeaderId: { in: teacherIds } }, data: { teamLeaderId: null } });
    await tx.enrollment.updateMany({
      where: { renewedFromId: { in: enrollmentIds }, id: { notIn: enrollmentIds } },
      data: { renewedFromId: null },
    });
    await tx.teacherRate.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await tx.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await tx.teacher.deleteMany({ where: { id: { in: teacherIds } } });
  });

  await logAudit({
    actor,
    action: "DELETE",
    targetType: "Teacher",
    description: `강사 일괄 완전삭제 ${teacherIds.length}명 (연결된 수강내역 ${enrollmentIds.length}건 포함): ${teachers.map((t) => t.realName).join(", ")}`,
  });

  revalidatePath("/teachers");
}

export async function updateTeacherAccountStatus(id: number, accountStatus: AccountStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.update");
  await prisma.teacher.update({ where: { id }, data: { accountStatus } });
  await logAudit({
    actor,
    action: accountStatus === "ACTIVE" ? "UPDATE" : "ACCOUNT_DISABLED",
    targetType: "Teacher",
    targetId: id,
    description: `계정 상태 변경: ${accountStatus}`,
  });
  revalidatePath("/teachers");
}
