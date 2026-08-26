import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  const sessions = await prisma.classSession.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      status: "COMPLETED",
      ...(filter === "unwritten" ? { evaluation: null } : {}),
    },
    orderBy: { scheduledAt: "desc" },
    include: { student: true, teacher: true, evaluation: true },
    take: 100,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">일일평가서 관리</h1>
        <div className="flex gap-2 text-sm">
          <Link
            href="/evaluations"
            className={`rounded-lg px-3 py-1.5 font-medium ${!filter ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
          >
            전체
          </Link>
          <Link
            href="/evaluations?filter=unwritten"
            className={`rounded-lg px-3 py-1.5 font-medium ${filter === "unwritten" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
          >
            미작성
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">수업 일시</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">평가서</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{fmtDateTime(s.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-600">{s.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
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
                  <Link href={`/evaluations/${s.id}`} className="text-xs font-semibold text-blue-700 underline">
                    {s.evaluation ? "보기/수정" : "작성"}
                  </Link>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
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
