"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { WEEKDAYS } from "@/lib/weekdays";
import { syncTeacherScheduleToGoogleSheet } from "@/lib/teacherScheduleSheet";
import { findRecurringScheduleConflicts, resolveScheduleTime } from "./scheduleUtils";
import { isWithinAvailableHours, timeStringToMinuteOfDay } from "@/lib/timeSlots";
import { Prisma, type EnrollmentStatus, type EnrollmentRequestStatus, type PaymentStatus } from "@/generated/prisma/client";

const REQUEST_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "CANCELLED"] as const;

// 마케팅 사이트에서 학생이 제출한 수강신청 리드(EnrollmentRequest)의 상태 변경 — 예전
// 별도 페이지(/enrollment-requests)에 있던 것을 수강내역관리 화면 상단 "신청" 목록으로
// 옮기며 이 파일로 함께 이동했다.
export async function updateEnrollmentRequestStatus(id: number, status: EnrollmentRequestStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollment_requests.update");
  if (!REQUEST_STATUSES.includes(status)) throw new Error("잘못된 상태값입니다.");

  await prisma.enrollmentRequest.update({ where: { id }, data: { status } });
  await logAudit({ actor, action: "UPDATE", targetType: "EnrollmentRequest", targetId: id, description: `status = ${status}` });
  revalidatePath("/enrollments");
}

// 월~일 표시 순서로 정렬 — WEEKDAYS는 일(0)이 먼저라 체크박스 제출 순서를 그대로 쓰면
// "일월수" 처럼 어색하게 나온다.
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type AvailableTeacher = { id: number; label: string };

/**
 * 요일선택/강의 시간(기본+요일별 오버라이드)이 모두 정해진 뒤, 그 반복 패턴과 시간이
 * 겹치지 않는 강사만 골라 돌려준다. 실제 개별 수업(ClassSession) 없이 Enrollment의
 * scheduleDays/classTime(s)만으로 비교하는 "반복 일정" 충돌 검사라는 점에서, 확정
 * 날짜 하나만 검사하는 scheduleConflict.ts의 findTeacherScheduleConflict와 다르다.
 */
export async function findAvailableTeachersForSchedule(args: {
  weekdayValues: number[];
  classTime: string;
  classTimes: Record<string, string>;
  classDurationMin: number;
  /** 수정 중인 수강 건 자신은 충돌 후보에서 제외한다 — 안 그러면 현재 배정된 강사가
   * 자기 자신의 기존 스케줄과 겹친다고 잘못 판정되어 "찾아보기"에서 빠져버린다. */
  excludeEnrollmentId?: number;
}): Promise<AvailableTeacher[]> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.view");

  // "모두 동일한 시간" 체크를 끄고 요일마다 다른 시간을 쓸 때는 기본 classTime이
  // 비어 있을 수 있다 — 그럴 땐 체크된 요일 전부가 각자 시각을 갖고 있는지로 대신
  // 판단한다(resolveScheduleTime이 요일별 오버라이드를 우선 쓰므로 기본값 없이도
  // 문제없이 풀린다).
  const everyDayHasTime = args.weekdayValues.every((day) => resolveScheduleTime(args.classTime, args.classTimes, day));
  if (args.weekdayValues.length === 0 || !everyDayHasTime) return [];

  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID, approvalStatus: "APPROVED", accountStatus: "ACTIVE" },
    orderBy: { realName: "asc" },
    select: TEACHER_SUMMARY_SELECT,
  });

  // 요일별 실제 시각이 그 강사의 등록된 근무가능 시간대(availableHours) 안에 전부
  // 들어오는지 먼저 걸러낸다 — 하나라도 벗어나는 요일이 있으면 후보에서 제외한다.
  const isWithinWorkingHours = (teacher: { availableHours: number[] }) =>
    args.weekdayValues.every((day) => {
      const time = resolveScheduleTime(args.classTime, args.classTimes, day);
      if (!time) return false;
      return isWithinAvailableHours(teacher.availableHours, timeStringToMinuteOfDay(time), args.classDurationMin);
    });

  const available: AvailableTeacher[] = [];
  for (const teacher of teachers) {
    if (!isWithinWorkingHours(teacher)) continue;
    const otherEnrollments = await prisma.enrollment.findMany({
      where: {
        teacherId: teacher.id,
        status: { notIn: ["COMPLETED"] },
        ...(args.excludeEnrollmentId ? { id: { not: args.excludeEnrollmentId } } : {}),
      },
      select: { id: true, scheduleDays: true, classTime: true, classTimes: true, classDurationMin: true },
    });
    const conflicts = findRecurringScheduleConflicts(
      {
        weekdayValues: args.weekdayValues,
        classTime: args.classTime,
        classTimes: args.classTimes,
        durationMin: args.classDurationMin,
      },
      otherEnrollments,
    );
    if (conflicts.length === 0) available.push({ id: teacher.id, label: teacher.realName });
  }
  return available;
}

export async function createEnrollment(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.create");

  const studentId = Number(formData.get("studentId"));
  const teacherIdRaw = String(formData.get("teacherId") ?? "");
  const packageMonths = Number(formData.get("packageMonths") ?? 1);
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const scheduleDayValues = formData
    .getAll("scheduleDays")
    .map((v) => Number(v))
    .filter((v) => WEEKDAYS.some((d) => d.value === v));
  const scheduleDays = WEEKDAY_DISPLAY_ORDER.filter((v) => scheduleDayValues.includes(v))
    .map((v) => WEEKDAYS.find((d) => d.value === v)!.label)
    .join("");
  const classDurationMin = Number(formData.get("classDurationMin") ?? 25);
  const totalSessions = Number(formData.get("totalSessions") ?? 0);
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const textbookName = String(formData.get("textbookName") ?? "").trim();
  const curriculum = String(formData.get("curriculum") ?? "").trim();
  const studentLevel = String(formData.get("studentLevel") ?? "").trim();
  const studentEnglishName = String(formData.get("studentEnglishName") ?? "").trim();
  const classTime = String(formData.get("classTime") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  // 요일별 시각 재설정 — 체크된 요일 중 개별 시각이 입력된 것만 모은다. 나머지는
  // 위 기본 classTime을 그대로 쓰므로 저장할 필요가 없다.
  const classTimes: Record<string, string> = {};
  for (const v of scheduleDayValues) {
    const dayTime = String(formData.get(`dayTime_${v}`) ?? "").trim();
    if (dayTime) classTimes[String(v)] = dayTime;
  }
  const returnToRaw = String(formData.get("returnTo") ?? "/enrollments");
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/enrollments";
  const sourceRequestIdRaw = String(formData.get("sourceRequestId") ?? "");
  const sourceRequestId = sourceRequestIdRaw ? Number(sourceRequestIdRaw) : null;
  const renewedFromIdRaw = String(formData.get("renewedFromId") ?? "");
  const renewedFromId = renewedFromIdRaw ? Number(renewedFromIdRaw) : null;
  const reservationIdRaw = String(formData.get("reservationId") ?? "");
  const reservationId = reservationIdRaw ? Number(reservationIdRaw) : null;
  const teacherId = teacherIdRaw ? Number(teacherIdRaw) : null;

  if (!studentId || !classMethod || !scheduleDays || !totalSessions || !startDate || !endDate) {
    return { error: "필수 항목을 모두 입력해주세요." };
  }

  // "신청" 목록에서 강사를 배정해 등록으로 전환하는 흐름(sourceRequestId)이나 "강사 자리
  // 예약"에서 등록전환하는 흐름(reservationId)은 새 건을 곧바로 "진행중"으로 만든다 —
  // 둘 다 강사가 이미 정해진 상태로 들어오기 때문이다. 그 외에는 일반 등록과 똑같이
  // "신청" 상태로 만든다.
  const isRequestConversion = sourceRequestId !== null && teacherId !== null;
  const isReservationConversion = reservationId !== null && teacherId !== null;

  const enrollment = await prisma.enrollment.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      studentId,
      teacherId,
      packageMonths,
      classMethod,
      scheduleDays,
      classDurationMin,
      totalSessions,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      classType: "1:1",
      textbookName: textbookName || null,
      curriculum: curriculum || null,
      studentLevel: studentLevel || null,
      studentEnglishName: studentEnglishName || null,
      classTime: classTime || null,
      classTimes: Object.keys(classTimes).length > 0 ? classTimes : undefined,
      adminNote: adminNote || null,
      status: isRequestConversion || isReservationConversion ? "ACTIVE" : "APPLIED",
      paymentStatus: "UNPAID",
      renewedFromId: renewedFromId ?? undefined,
    },
  });
  await logAudit({
    actor,
    action: "CREATE",
    targetType: "Enrollment",
    targetId: enrollment.id,
    description: renewedFromId ? `재수강 신청 (원본 수강 건 #${renewedFromId})` : undefined,
  });

  if (isRequestConversion) {
    await prisma.enrollmentRequest.update({ where: { id: sourceRequestId }, data: { status: "CONVERTED" } });
    await logAudit({
      actor,
      action: "UPDATE",
      targetType: "EnrollmentRequest",
      targetId: sourceRequestId,
      description: `등록전환 — 수강 건 #${enrollment.id}로 전환`,
    });
  }

  if (isReservationConversion) {
    await prisma.slotReservation.update({
      where: { id: reservationId },
      data: { status: "CONVERTED", convertedEnrollmentId: enrollment.id },
    });
    await logAudit({
      actor,
      action: "UPDATE",
      targetType: "SlotReservation",
      targetId: reservationId,
      description: `예약 등록전환 — 수강 건 #${enrollment.id}로 전환`,
    });
    revalidatePath("/reservations");
  }

  revalidatePath("/enrollments");
  revalidatePath("/students");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  redirect(returnTo);
}

export async function updateEnrollment(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.update");

  const existing = await prisma.enrollment.findUnique({ where: { id } });
  if (!existing) {
    return { error: "존재하지 않는 수강 건입니다." };
  }

  const teacherIdRaw = String(formData.get("teacherId") ?? "");
  const packageMonths = Number(formData.get("packageMonths") ?? 1);
  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const scheduleDayValues = formData
    .getAll("scheduleDays")
    .map((v) => Number(v))
    .filter((v) => WEEKDAYS.some((d) => d.value === v));
  const scheduleDays = WEEKDAY_DISPLAY_ORDER.filter((v) => scheduleDayValues.includes(v))
    .map((v) => WEEKDAYS.find((d) => d.value === v)!.label)
    .join("");
  const classDurationMin = Number(formData.get("classDurationMin") ?? 25);
  const totalSessions = Number(formData.get("totalSessions") ?? 0);
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const textbookName = String(formData.get("textbookName") ?? "").trim();
  const curriculum = String(formData.get("curriculum") ?? "").trim();
  const studentLevel = String(formData.get("studentLevel") ?? "").trim();
  const studentEnglishName = String(formData.get("studentEnglishName") ?? "").trim();
  const classTime = String(formData.get("classTime") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  const classTimes: Record<string, string> = {};
  for (const v of scheduleDayValues) {
    const dayTime = String(formData.get(`dayTime_${v}`) ?? "").trim();
    if (dayTime) classTimes[String(v)] = dayTime;
  }

  if (!classMethod || !scheduleDays || !totalSessions || !startDate || !endDate) {
    return { error: "필수 항목을 모두 입력해주세요." };
  }

  const newTeacherId = teacherIdRaw ? Number(teacherIdRaw) : null;

  await prisma.enrollment.update({
    where: { id },
    data: {
      teacherId: newTeacherId,
      packageMonths,
      classMethod,
      scheduleDays,
      classDurationMin,
      totalSessions,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      textbookName: textbookName || null,
      curriculum: curriculum || null,
      studentLevel: studentLevel || null,
      studentEnglishName: studentEnglishName || null,
      classTime: classTime || null,
      classTimes: Object.keys(classTimes).length > 0 ? classTimes : Prisma.JsonNull,
      adminNote: adminNote || null,
    },
  });

  // 이미 생성된 ClassSession은 생성 시점의 teacherId/durationMin을 각자 들고 있어(비정규화),
  // Enrollment만 바꿔서는 강사 스케줄에 반영되지 않는다 — 아직 진행되지 않은(SCHEDULED)
  // 수업만 골라 새 값으로 맞춰준다. 이미 완료/취소/휴강 처리된 수업은 실제로 있었던
  // 사실 그대로 두기 위해 건드리지 않는다. classSession.teacherId는 필수 필드라
  // "미배정"으로 되돌리는 경우(newTeacherId가 null)는 반영할 수 없어 건너뛴다.
  const sessionUpdateData: { teacherId?: number; durationMin?: number } = {};
  if (newTeacherId !== null && newTeacherId !== existing.teacherId) sessionUpdateData.teacherId = newTeacherId;
  if (classDurationMin !== existing.classDurationMin) sessionUpdateData.durationMin = classDurationMin;
  if (Object.keys(sessionUpdateData).length > 0) {
    await prisma.classSession.updateMany({
      where: { enrollmentId: id, status: "SCHEDULED", deletedAt: null },
      data: sessionUpdateData,
    });
  }

  await logAudit({ actor, action: "UPDATE", targetType: "Enrollment", targetId: id, description: "수강 건 정보 수정" });

  revalidatePath("/enrollments");
  revalidatePath("/students");
  revalidatePath("/schedule");
  revalidatePath("/teacher/schedule");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
  redirect("/enrollments");
}

export async function updateEnrollmentStatus(id: number, status: EnrollmentStatus) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.update");

  const existing = await prisma.enrollment.findUnique({ where: { id } });
  if (!existing) return;

  // "홀드"는 단순 라벨이 아니라 실제로 예정 수업을 멈춘다 — holdApply.ts 참고. 홀드로
  // 들어갈 때/나올 때는 그 부수효과까지 함께 처리해야 하므로 일반 상태 변경과 분기한다.
  if (status === "HOLDING" && existing.status !== "HOLDING") {
    const { applyHold } = await import("@/lib/holdApply");
    await applyHold(id);
  } else if (existing.status === "HOLDING" && status !== "HOLDING") {
    const { releaseHold } = await import("@/lib/holdApply");
    await releaseHold(id);
    if (status !== "ACTIVE") {
      await prisma.enrollment.update({ where: { id }, data: { status } });
    }
  } else {
    await prisma.enrollment.update({ where: { id }, data: { status } });
  }

  await logAudit({ actor, action: "UPDATE", targetType: "Enrollment", targetId: id, description: `상태 변경: ${status}` });
  revalidatePath("/enrollments");
  revalidatePath("/schedule");
  revalidatePath("/student");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}

export async function updateEnrollmentPrice(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.update");

  const actualPriceRaw = String(formData.get("actualPriceKRW") ?? "").trim();
  const paymentStatus = String(formData.get("paymentStatus") ?? "") as PaymentStatus | "";

  if (!/^\d+$/.test(actualPriceRaw)) {
    return { error: "실제 수강료는 0 이상의 숫자여야 합니다." };
  }
  const actualPriceKRW = Number(actualPriceRaw);

  await prisma.enrollment.update({
    where: { id },
    data: { actualPriceKRW, paymentStatus: paymentStatus || null },
  });
  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "Enrollment",
    targetId: id,
    description: `결제 금액 수정: ${actualPriceKRW.toLocaleString()}원`,
  });

  revalidatePath("/enrollments");
  redirect("/enrollments");
}

// "재수강"은 더 이상 클릭 즉시 레코드를 만들지 않는다 — /enrollments/new?renewFrom=<id>가
// 기존 스케줄을 기본값으로 채운 등록 폼을 보여주고, 관리자가 검토·수정 후 저장을 눌러야
// createEnrollment로 실제 생성된다(그 화면의 renewedFromId가 감사 로그에 원본 건을 남김).

export async function deleteEnrollment(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.delete");
  await prisma.enrollment.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "Enrollment", targetId: id });
  revalidatePath("/enrollments");
  syncTeacherScheduleToGoogleSheet().catch(() => {});
}
