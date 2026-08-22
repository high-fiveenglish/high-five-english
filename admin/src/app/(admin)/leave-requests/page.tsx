import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { revertLeaveRequest } from "./actions";
import { RevertButton } from "./RevertButton";
import { CreateLeaveForm } from "./CreateLeaveForm";

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function LeaveRequestsPage() {
  const [leaveRequests, scheduledSessions] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { createdAt: "desc" },
      include: { student: true, classSession: { include: { teacher: true } } },
      take: 100,
    }),
    prisma.classSession.findMany({
      where: { siteId: DEFAULT_SITE_ID, status: "SCHEDULED" },
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">신청일</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">휴강한 수업 일시</th>
              <th className="px-4 py-3">사유</th>
              <th className="px-4 py-3">연장일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {leaveRequests.map((lr) => (
              <tr key={lr.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(lr.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{lr.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{lr.classSession.teacher.realName}</td>
                <td className="px-4 py-3 text-slate-600">{fmtDateTime(lr.classSession.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-500">{lr.reason ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">+{lr.extendedDays}일</td>
                <td className="px-4 py-3 text-right">
                  <RevertButton action={revertLeaveRequest.bind(null, lr.id)} />
                </td>
              </tr>
            ))}
            {leaveRequests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
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
