import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteMonthlyEvaluation } from "./actions";

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function MonthlyEvaluationsPage() {
  const evaluations = await prisma.monthlyEvaluation.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: [{ yearMonth: "desc" }, { id: "desc" }],
    include: { student: true, teacher: true },
    take: 200,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">월평가서 관리</h1>
        <Link
          href="/monthly-evaluations/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 월평가서 작성
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">대상 월</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">최종 수정</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {evaluations.map((ev) => (
              <tr key={ev.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{ev.yearMonth}</td>
                <td className="px-4 py-3 text-slate-600">{ev.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{ev.teacher?.realName ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(ev.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/monthly-evaluations/${ev.id}`} className="text-xs font-semibold text-blue-700 underline">
                    보기/수정
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteMonthlyEvaluation.bind(null, ev.id)} />
                </td>
              </tr>
            ))}
            {evaluations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  작성된 월평가서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
