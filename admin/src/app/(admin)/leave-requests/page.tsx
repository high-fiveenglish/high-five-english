import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { revertLeaveRequest, approveLeaveRequest, rejectLeaveRequest } from "./actions";
import { RevertButton } from "./RevertButton";
import { CreateLeaveForm } from "./CreateLeaveForm";
import { ApproveRejectButtons } from "./ApproveRejectButtons";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

const REQUEST_TYPE_LABEL: Record<string, string> = {
  STUDENT: "학생",
  ADMIN: "관리자",
  MANAGER: "매니저",
  TEACHER: "강사",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기중",
  APPROVED: "승인됨",
  REJECTED: "거부됨",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-slate-200 text-slate-500",
};

export default async function LeaveRequestsPage() {
  const [leaveRequests, scheduledSessions] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { createdAt: "desc" },
      include: { student: true, classSession: { include: { teacher: true } } },
      take: 100,
    }),
    prisma.classSession.findMany({
      where: { siteId: DEFAULT_SITE_ID, status: "SCHEDULED", deletedAt: null },
      orderBy: { scheduledAt: "asc" },
      include: { student: true, teacher: true },
      take: 200,
    }),
  ]);

  const options = scheduledSessions.map((s) => ({
    id: s.id,
    label: `${fmtDateTime(s.scheduledAt)} · ${s.student.name} 학생 · ${s.teacher.realName} 강사`,
  }));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">휴강 관리</h1>

      <CreateLeaveForm options={options} />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1150px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">신청 유형</th>
              <th className="px-4 py-3">신청일</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">휴강한 수업 일시</th>
              <th className="px-4 py-3">사유</th>
              <th className="px-4 py-3">연장일</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {leaveRequests.map((lr) => (
              <tr key={lr.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-600">{REQUEST_TYPE_LABEL[lr.requestedByRole] ?? lr.requestedByRole}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(lr.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{lr.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{lr.classSession.teacher.realName}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDateTime(lr.classSession.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-500">{lr.reason ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">+{lr.extendedDays}일</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[lr.status]}`}>
                    {STATUS_LABEL[lr.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {lr.status === "PENDING" ? (
                    <ApproveRejectButtons
                      approveAction={approveLeaveRequest.bind(null, lr.id)}
                      rejectAction={rejectLeaveRequest.bind(null, lr.id)}
                    />
                  ) : lr.status === "APPROVED" ? (
                    <RevertButton action={revertLeaveRequest.bind(null, lr.id)} />
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {leaveRequests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  등록된 휴강 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
