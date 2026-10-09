import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { formatAppDateTime } from "@/lib/appTime";
import { LeaveRequestButton } from "./LeaveRequestButton";
import { STUDENT_LEAVE_MIN_LEAD_MS, summarizeLeaveQuota, usedFromLeaveRows } from "@/lib/leavePolicy";

const fmtDateTime = formatAppDateTime;

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  MAKEUP_NEEDED: "보충필요",
  LEAVE: "휴강",
};

export default async function StudentSessionsPage() {
  const student = await requireStudent();

  const sessions = await prisma.classSession.findMany({
    where: { studentId: student.id },
    orderBy: { scheduledAt: "desc" },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT }, leaveRequest: true },
    take: 100,
  });
  const now = new Date().getTime();

  // 학생 연기 횟수(등록기간 전체 기준) — 정책/계산은 lib/leavePolicy.ts 한 곳에 있다.
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: student.id, status: { in: ["ACTIVE", "APPLIED", "PAID", "HOLDING"] } },
    orderBy: { startDate: "desc" },
  });
  const leaveRows = await prisma.leaveRequest.findMany({
    where: { studentId: student.id, enrollmentId: { in: enrollments.map((e) => e.id) } },
    select: { enrollmentId: true, status: true, quotaImpact: true, source: true, requestedByRole: true, academyClosureId: true },
  });
  const quotas = enrollments.map((e) => ({
    id: e.id,
    ...summarizeLeaveQuota({
      scheduleDays: e.scheduleDays,
      packageMonths: e.packageMonths,
      adminAdjustment: e.leaveQuotaAdjustment,
      usedCount: usedFromLeaveRows(leaveRows.filter((l) => l.enrollmentId === e.id)),
    }),
  }));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">내 수업</h1>

      {quotas.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">수업 연기 가능 횟수 (등록기간 전체 기준)</p>
          {quotas.map((q) => (
            <p key={q.id} className="mt-1">
              최종 적용 {q.effectiveQuota}회 · 사용 {q.usedCount}회 · <span className="font-bold">잔여 {q.remainingCount}회</span>
            </p>
          ))}
          <p className="mt-1 text-xs text-slate-400">연기는 수업 시작 2시간 전까지 신청할 수 있습니다.</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">수업 일시</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">시간(분)</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">
                  {fmtDateTime(s.scheduledAt)}
                  {s.isSupplement && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      보충수업
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
                <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                <td className="px-4 py-3">
                  <span className="text-slate-600">{STATUS_LABEL[s.status]}</span>
                  {s.status === "LEAVE" && s.leaveRequest?.reason && (
                    <span className="ml-1.5 text-xs text-slate-400">({s.leaveRequest.reason})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === "SCHEDULED" && s.scheduledAt.getTime() - now >= STUDENT_LEAVE_MIN_LEAD_MS ? (
                    <LeaveRequestButton sessionId={s.id} />
                  ) : s.status === "SCHEDULED" && s.scheduledAt.getTime() > now ? (
                    <span className="text-xs text-slate-400">시작 2시간 전부터는 연기할 수 없습니다</span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  등록된 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
