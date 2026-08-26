import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { formatAppDateTime } from "@/lib/appTime";
import { LeaveRequestButton } from "./LeaveRequestButton";

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
    include: { teacher: true, leaveRequest: true },
    take: 100,
  });
  const now = new Date().getTime();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">내 수업</h1>

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
                <td className="px-4 py-3 text-slate-900">{fmtDateTime(s.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
                <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                <td className="px-4 py-3">
                  <span className="text-slate-600">{STATUS_LABEL[s.status]}</span>
                  {s.status === "LEAVE" && s.leaveRequest?.reason && (
                    <span className="ml-1.5 text-xs text-slate-400">({s.leaveRequest.reason})</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === "SCHEDULED" && s.scheduledAt.getTime() >= now ? (
                    <LeaveRequestButton sessionId={s.id} />
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
