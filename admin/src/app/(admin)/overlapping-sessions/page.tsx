import Link from "next/link";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findAllOverlappingSessions } from "@/lib/scheduleConflict";
import { formatAppDateTime } from "@/lib/appTime";
import { RefreshButton } from "./RefreshButton";

const fmtDateTime = formatAppDateTime;
const PAGE_SIZE = 20;

export default async function OverlappingSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const allPairs = await findAllOverlappingSessions(DEFAULT_SITE_ID);
  const totalPages = Math.max(1, Math.ceil(allPairs.length / PAGE_SIZE));
  const pairs = allPairs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function pageHref(p: number): string {
    return p > 1 ? `/overlapping-sessions?page=${p}` : "/overlapping-sessions";
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">겹치는 수업 내역</h1>
        <RefreshButton />
      </div>
      <p className="mb-6 text-sm text-slate-500">
        같은 강사에게 시간이 겹치게 배정된 수업을 진단합니다. 수업 등록·강사 배정 시 겹침을 미리 막고
        있으므로 정상적으로는 비어 있어야 합니다 — 상태를 수동으로 되돌리는 등의 예외 상황을 잡아내는
        점검용 화면입니다.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">수업 A</th>
              <th className="px-4 py-3">수업 B</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.teacherName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {fmtDateTime(p.a.scheduledAt)} ({p.a.durationMin}분) · {p.a.studentName} 학생
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {fmtDateTime(p.b.scheduledAt)} ({p.b.durationMin}분) · {p.b.studentName} 학생
                </td>
              </tr>
            ))}
            {pairs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  겹치는 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 ${
              page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
            }`}
          >
            이전
          </Link>
          <span className="px-2 text-slate-500">
            {page} / {totalPages.toLocaleString()} 페이지 (총 {allPairs.length.toLocaleString()}건)
          </span>
          <Link
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 ${
              page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
            }`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
