import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  MAKEUP_NEEDED: "보충필요",
  LEAVE: "휴강",
};

export default async function TeacherSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const teacher = await requireTeacher();
  const { filter } = await searchParams;

  const sessions = await prisma.classSession.findMany({
    where: {
      teacherId: teacher.id,
      deletedAt: null,
      ...(filter === "unwritten" ? { status: "COMPLETED", evaluation: null } : {}),
    },
    orderBy: { scheduledAt: "desc" },
    include: { student: true, evaluation: true, enrollment: true },
    take: 100,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">My Classes</h1>
        <div className="flex gap-2 text-sm">
          <Link
            href="/teacher/sessions"
            className={`rounded-lg px-3 py-1.5 font-medium ${!filter ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            전체
          </Link>
          <Link
            href="/teacher/sessions?filter=unwritten"
            className={`rounded-lg px-3 py-1.5 font-medium ${filter === "unwritten" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            평가서 미작성
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">수업 일시</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">시간(분)</th>
              <th className="px-4 py-3">수업 타입</th>
              <th className="px-4 py-3">수업 방식</th>
              <th className="px-4 py-3">교재</th>
              <th className="px-4 py-3">진도</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">평가서</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{fmtDateTime(s.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-600">{s.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                <td className="px-4 py-3 text-slate-600">{s.enrollment.classType}</td>
                <td className="px-4 py-3 text-slate-600">{s.enrollment.classMethod}</td>
                <td className="max-w-[140px] truncate px-4 py-3 text-slate-600" title={s.enrollment.textbookName ?? undefined}>
                  {s.enrollment.textbookName ?? "-"}
                </td>
                <td className="max-w-[160px] truncate px-4 py-3 text-slate-500" title={s.progressNote ?? undefined}>
                  {s.progressNote ?? "기록 없음"}
                </td>
                <td className="px-4 py-3 text-slate-600">{STATUS_LABEL[s.status]}</td>
                <td className="px-4 py-3">
                  {s.evaluation ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                      작성됨
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                      미작성
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === "COMPLETED" ? (
                    <Link href={`/teacher/sessions/${s.id}`} className="text-xs font-semibold text-blue-700 underline">
                      {s.evaluation ? "평가서 수정" : "평가서 작성"}
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  해당하는 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
