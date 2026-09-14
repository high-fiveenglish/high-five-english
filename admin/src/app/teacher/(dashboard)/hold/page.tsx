import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";
import { studentDisplayName } from "@/lib/teacherPortalLabels";

const fmtDate = formatAppDate;
const fmtDateTime = formatAppDateTime;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-slate-200 text-slate-500",
};

export default async function TeacherHoldPage() {
  const teacher = await requireTeacher();

  // 본인이 신청한 Hold만 조회한다 — classSession.teacherId를 통해 서버에서 스코프.
  const holdRequests = await prisma.leaveRequest.findMany({
    where: { requestedByRole: "TEACHER", classSession: { teacherId: teacher.id } },
    include: { student: true, classSession: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Hold Management</h1>
        <Link
          href="/teacher/hold/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + New Hold Request
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Extended Days</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created At</th>
            </tr>
          </thead>
          <tbody>
            {holdRequests.map((h) => (
              <tr key={h.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{fmtDate(h.classSession.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-600">{studentDisplayName(h.student.name, h.student.englishName)}</td>
                <td className="px-4 py-3 text-slate-500">{h.reason ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">+{h.extendedDays} days</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[h.status]}`}>
                    {STATUS_LABEL[h.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(h.createdAt)}</td>
              </tr>
            ))}
            {holdRequests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No hold requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
