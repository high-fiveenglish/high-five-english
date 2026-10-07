import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { AdminSessionCalendar } from "./AdminSessionCalendar";
import { parseRouteId } from "@/lib/routeId";
import { evaluationStateOf } from "@/lib/reschedule";
import { summarizeLeaveQuota, usedFromLeaveRows, weeklyLessonCount } from "@/lib/leavePolicy";

export default async function StudentSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = parseRouteId(id);
  if (studentId === null) notFound();

  const [student, sessions, enrollments] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.classSession.findMany({
      where: { studentId },
      orderBy: { scheduledAt: "asc" },
      include: {
        teacher: { select: TEACHER_SUMMARY_SELECT },
        evaluation: true,
        leaveRequest: true,
        audioRecording: { select: { processingStatus: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { studentId, status: { in: ["ACTIVE", "APPLIED"] } },
      orderBy: { id: "desc" },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
    }),
  ]);

  if (!student || student.deletedAt) notFound();

  return (
    <div>
      <Link href="/students" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 학생관리로
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">수업관리 — {student.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        수업을 클릭하면 상세 정보와 처리 옵션이 나옵니다. 학생연기는 학생의 연기 가능 횟수에서 차감되고(관리자가 대신
        눌러도 동일, 2시간 제한은 학생이 직접 신청할 때만 적용), 관리자연기는 차감되지 않습니다. 연기된 수업은 정규 수업
        시퀀스를 뒤로 밀어 다음 유효 슬롯에 배치되며 수강 종료일이 마지막 정규 수업 날짜까지 늘어납니다.
      </p>

      <AdminSessionCalendar
        studentId={studentId}
        sessions={sessions.map((s) => ({
          id: s.id,
          scheduledAt: s.scheduledAt,
          durationMin: s.durationMin,
          status: s.status,
          teacherName: s.teacher.realName,
          evaluationId: s.evaluation ? s.id : null,
          leaveReason: s.leaveRequest?.reason ?? null,
          leaveRequestId: s.leaveRequest?.id ?? null,
          isSupplement: s.isSupplement,
          enrollmentId: s.enrollmentId,
          evaluationState: evaluationStateOf(s),
          relatedSessionId: s.relatedSessionId,
        }))}
        quotas={enrollments.map((e) => ({
          enrollmentId: e.id,
          label: `${e.teacher?.realName ?? "미배정"} · ${e.startDate.toISOString().slice(0, 10)}~${e.endDate.toISOString().slice(0, 10)} · 주${weeklyLessonCount(e.scheduleDays)}회·${e.packageMonths}개월`,
          ...summarizeLeaveQuota({
            scheduleDays: e.scheduleDays,
            packageMonths: e.packageMonths,
            adminAdjustment: e.leaveQuotaAdjustment,
            usedCount: usedFromLeaveRows(sessions.filter((s) => s.enrollmentId === e.id && s.leaveRequest).map((s) => s.leaveRequest!)),
          }),
        }))}
        enrollments={enrollments.map((e) => ({
          id: e.id,
          label: `${e.teacher?.realName ?? "미배정"} · ${e.classDurationMin}분 · ${e.startDate.toISOString().slice(0, 10)}~${e.endDate.toISOString().slice(0, 10)}`,
          classDurationMin: e.classDurationMin,
          hasTeacher: !!e.teacherId,
        }))}
      />
    </div>
  );
}
