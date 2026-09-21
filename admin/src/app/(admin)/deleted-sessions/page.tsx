import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { restoreClassSession } from "../schedule/actions";
import { RestoreButton } from "./RestoreButton";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function DeletedSessionsPage() {
  const [sessions, totalCount] = await Promise.all([
    prisma.classSession.findMany({
      where: { siteId: DEFAULT_SITE_ID, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
      take: 200,
    }),
    prisma.classSession.count({ where: { siteId: DEFAULT_SITE_ID, deletedAt: { not: null } } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">수업 삭제 내역</h1>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">삭제일시</th>
              <th className="px-4 py-3">수업 일시</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">시간(분)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{totalCount - i}</td>
                <td className="px-4 py-3 text-slate-500">{s.deletedAt ? fmtDateTime(s.deletedAt) : "-"}</td>
                <td className="px-4 py-3 text-slate-900">{fmtDateTime(s.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-600">{s.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
                <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                <td className="px-4 py-3 text-right">
                  <RestoreButton action={restoreClassSession.bind(null, s.id)} />
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  삭제된 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
