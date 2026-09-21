"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { applyClassLeave } from "@/lib/leaveApply";
import { parseAppDateTime } from "@/lib/appTime";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";

const EXTENDED_DAYS = 1;

export async function createLeaveRequestAdmin(
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const sessionId = Number(formData.get("classSessionId"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!sessionId) {
    return { error: "수업을 선택해주세요." };
  }

  const session = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { leaveRequest: true } });
  if (!session) {
    return { error: "존재하지 않는 수업입니다." };
  }
  if (session.status !== "SCHEDULED") {
    return { error: "예정된 수업만 휴강 처리할 수 있습니다." };
  }
  // classSessionId가 unique라, 강사가 신청한 PENDING Hold가 이미 있는 수업에
  // 관리자가 별도로 등록을 시도하면 DB 제약 위반으로 죽는 대신 여기서 먼저 막는다.
  if (session.leaveRequest && session.leaveRequest.status !== "REJECTED") {
    return { error: "이미 처리 중이거나 적용된 휴강 신청이 있는 수업입니다." };
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: session.enrollmentId } });
  if (!enrollment) {
    return { error: "연결된 수강신청 정보를 찾을 수 없습니다." };
  }

  // 관리자 등록은 기존과 동일하게 즉시 확정(APPROVED)된다 — Teacher Hold만 승인
  // 대기(PENDING)를 거친다.
  const leaveRequest = await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: sessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: EXTENDED_DAYS,
    });
    // classSessionId가 unique이므로, 이전에 거부된(REJECTED) 강사 Hold 레코드가
    // 남아있는 경우를 위해 create 대신 upsert를 쓴다.
    return tx.leaveRequest.upsert({
      where: { classSessionId: sessionId },
      create: {
        siteId: DEFAULT_SITE_ID,
        classSessionId: sessionId,
        enrollmentId: enrollment.id,
        studentId: session.studentId,
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole: actor.role,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      update: {
        reason: reason || null,
        extendedDays: EXTENDED_DAYS,
        status: "APPROVED",
        requestedByRole: actor.role,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
    });
  });
  await logAudit({ actor, action: "LEAVE_REQUESTED", targetType: "LeaveRequest", targetId: leaveRequest.id, description: "관리자가 연기 생성·적용" });

  revalidatePath("/leave-requests");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  redirect("/leave-requests");
}

export async function approveLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) throw new Error("존재하지 않는 요청입니다.");
  if (leaveRequest.status !== "PENDING") throw new Error("대기 중인 요청만 승인할 수 있습니다.");

  const enrollment = await prisma.enrollment.findUnique({ where: { id: leaveRequest.enrollmentId } });
  if (!enrollment) throw new Error("연결된 수강신청 정보를 찾을 수 없습니다.");

  await prisma.$transaction(async (tx) => {
    await applyClassLeave(tx, {
      classSessionId: leaveRequest.classSessionId,
      enrollmentId: enrollment.id,
      currentEndDate: enrollment.endDate,
      extendedDays: leaveRequest.extendedDays,
    });
    await tx.leaveRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() },
    });
  });
  await logAudit({ actor, action: "LEAVE_APPROVED", targetType: "LeaveRequest", targetId: id });

  revalidatePath("/leave-requests");
  revalidatePath("/teacher/hold");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}

export async function rejectLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.update");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) throw new Error("존재하지 않는 요청입니다.");
  if (leaveRequest.status !== "PENDING") throw new Error("대기 중인 요청만 거부할 수 있습니다.");

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "REJECTED", approvedById: actor.id, approvedAt: new Date() },
  });
  await logAudit({ actor, action: "LEAVE_REJECTED", targetType: "LeaveRequest", targetId: id });

  revalidatePath("/leave-requests");
  revalidatePath("/teacher/hold");
}

export async function revertLeaveRequest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "leave_requests.revert");

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leaveRequest) return;
  // PENDING/REJECTED 요청은 애초에 ClassSession/Enrollment를 건드리지 않았으므로
  // 되돌릴 대상이 없다 — APPROVED(실제 적용된) 요청만 되돌릴 수 있다.
  if (leaveRequest.status !== "APPROVED") {
    throw new Error("실제로 적용된(승인된) 요청만 되돌릴 수 있습니다.");
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { id: leaveRequest.enrollmentId } });
  if (!enrollment) return;

  const restoredEndDate = new Date(enrollment.endDate);
  restoredEndDate.setDate(restoredEndDate.getDate() - leaveRequest.extendedDays);

  await prisma.$transaction([
    prisma.classSession.update({ where: { id: leaveRequest.classSessionId }, data: { status: "SCHEDULED" } }),
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { endDate: restoredEndDate } }),
    // LeaveRequest 자체를 삭제한다 — requestedByRole이 STUDENT였던 건도 이 레코드가
    // 사라지므로, "학생이 쓴 연기 횟수"를 이 테이블 기준으로 세는 곳이 있다면 자동으로
    // 복구된 것으로 잡힌다(별도의 카운터 필드를 따로 복구할 필요가 없다).
    prisma.leaveRequest.delete({ where: { id } }),
  ]);
  await logAudit({ actor, action: "DELETE", targetType: "LeaveRequest", targetId: id, description: "연기 되돌리기" });

  revalidatePath("/leave-requests");
  revalidatePath(`/students/${leaveRequest.studentId}/sessions`);
  revalidatePath("/schedule");
  revalidatePath("/teacher/schedule");
  revalidatePath("/student/sessions");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}

// 전체수업휴강(어학원 휴강) — 고른 날짜에 예정(SCHEDULED)된 모든 수업을 한 번에
// 휴강 처리한다. 개별 휴강과 똑같이 applyClassLeave로 각 수업을 처리해(학생별 수강
// 종료일도 각자 하루씩 연장됨) LeaveRequest를 만들되, academyClosureId로 묶어서
// "이 날짜에 이런 사유로 어학원이 전체 휴강했다"는 사실을 별도로 남긴다. 학생
// 화면(students/[id]/sessions/page.tsx)은 이미 leaveRequest.reason을 그대로
// 보여주므로, 이 사유는 개별 휴강과 똑같이 수강생 페이지에도 자동으로 노출된다.
export async function createAcademyClosure(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "academy_closures.create");

  const dateStr = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!dateStr || !reason) {
    return { error: "날짜와 사유를 모두 입력해주세요." };
  }

  const dayStart = parseAppDateTime(`${dateStr}T00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const sessions = await prisma.classSession.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      status: "SCHEDULED",
      deletedAt: null,
      scheduledAt: { gte: dayStart, lt: dayEnd },
    },
  });

  // 트랜잭션 진입 전에 관련 수강 건의 현재 종료일을 한 번에(배치로) 읽어와 메모리에
  // 들고 있는다 — 세션마다 tx 안에서 매번 다시 조회하면(특히 공휴일처럼 영향받는
  // 수업이 많을 때) 순차 쿼리 수가 늘어나 Prisma 인터랙티브 트랜잭션의 기본 타임아웃
  // (5초)을 넘겨 실패하는 걸 실제로 확인했다. 같은 수강 건에 그날 수업이 2개 이상
  // 있어도(보충수업 등) 이 맵을 매 반복마다 갱신하므로 순서대로 정확히 반영된다.
  const uniqueEnrollmentIds = [...new Set(sessions.map((s) => s.enrollmentId))];
  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: uniqueEnrollmentIds } },
    select: { id: true, endDate: true },
  });
  const endDateByEnrollment = new Map(enrollments.map((e) => [e.id, e.endDate]));

  const closure = await prisma.$transaction(
    async (tx) => {
      const created = await tx.academyClosure.create({
        data: { siteId: DEFAULT_SITE_ID, date: dayStart, reason, createdById: actor.id },
      });

      for (const session of sessions) {
        const currentEndDate = endDateByEnrollment.get(session.enrollmentId)!;
        await applyClassLeave(tx, {
          classSessionId: session.id,
          enrollmentId: session.enrollmentId,
          currentEndDate,
          extendedDays: EXTENDED_DAYS,
        });
        const newEndDate = new Date(currentEndDate);
        newEndDate.setDate(newEndDate.getDate() + EXTENDED_DAYS);
        endDateByEnrollment.set(session.enrollmentId, newEndDate);

        await tx.leaveRequest.create({
          data: {
            siteId: DEFAULT_SITE_ID,
            classSessionId: session.id,
            enrollmentId: session.enrollmentId,
            studentId: session.studentId,
            reason,
            extendedDays: EXTENDED_DAYS,
            status: "APPROVED",
            requestedByRole: actor.role,
            approvedById: actor.id,
            approvedAt: new Date(),
            academyClosureId: created.id,
          },
        });
      }

      return created;
    },
    { timeout: 30000 },
  );

  await logAudit({
    actor,
    action: "CREATE",
    targetType: "AcademyClosure",
    targetId: closure.id,
    description: `전체수업휴강 등록: ${dateStr}, ${sessions.length}건 (${reason})`,
  });

  revalidatePath("/leave-requests");
  revalidatePath("/schedule");
  revalidatePath("/teacher/schedule");
  revalidatePath("/student/sessions");
  for (const studentId of new Set(sessions.map((s) => s.studentId))) {
    revalidatePath(`/students/${studentId}/sessions`);
  }
  syncTeacherScheduleToGoogleSheet().catch(() => {});

  return {
    success:
      sessions.length > 0
        ? `${dateStr} 예정 수업 ${sessions.length}건을 휴강 처리했습니다.`
        : `${dateStr}에는 예정된 수업이 없어 휴강 기록만 등록했습니다.`,
  };
}

// 전체수업휴강 되돌리기 — 그 날 일괄 휴강 처리됐던 수업/수강 종료일을 전부 원래대로
// 되돌리고, 관련 LeaveRequest와 AcademyClosure 레코드 자체를 삭제한다.
export async function revertAcademyClosure(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "academy_closures.revert");

  const closure = await prisma.academyClosure.findUnique({
    where: { id },
    include: { leaveRequests: true },
  });
  if (!closure) return;

  // createAcademyClosure와 같은 이유로(순차 쿼리가 많으면 Prisma 인터랙티브 트랜잭션
  // 기본 타임아웃 5초를 넘길 수 있음) 관련 수강 건의 현재 종료일을 미리 배치로 읽어
  // 메모리 맵으로 관리한다.
  const uniqueEnrollmentIds = [...new Set(closure.leaveRequests.map((lr) => lr.enrollmentId))];
  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: uniqueEnrollmentIds } },
    select: { id: true, endDate: true },
  });
  const endDateByEnrollment = new Map(enrollments.map((e) => [e.id, e.endDate]));

  await prisma.$transaction(
    async (tx) => {
      for (const lr of closure.leaveRequests) {
        const currentEndDate = endDateByEnrollment.get(lr.enrollmentId)!;
        const restoredEndDate = new Date(currentEndDate);
        restoredEndDate.setDate(restoredEndDate.getDate() - lr.extendedDays);
        endDateByEnrollment.set(lr.enrollmentId, restoredEndDate);

        await tx.classSession.update({ where: { id: lr.classSessionId }, data: { status: "SCHEDULED" } });
        await tx.enrollment.update({ where: { id: lr.enrollmentId }, data: { endDate: restoredEndDate } });
        await tx.leaveRequest.delete({ where: { id: lr.id } });
      }
      await tx.academyClosure.delete({ where: { id } });
    },
    { timeout: 30000 },
  );

  await logAudit({
    actor,
    action: "DELETE",
    targetType: "AcademyClosure",
    targetId: id,
    description: `전체수업휴강 되돌리기 (${closure.leaveRequests.length}건)`,
  });

  revalidatePath("/leave-requests");
  revalidatePath("/schedule");
  revalidatePath("/teacher/schedule");
  revalidatePath("/student/sessions");
  for (const studentId of new Set(closure.leaveRequests.map((lr) => lr.studentId))) {
    revalidatePath(`/students/${studentId}/sessions`);
  }
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}
