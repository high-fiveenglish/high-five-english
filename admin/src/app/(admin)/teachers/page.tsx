import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { TeachersTable } from "./TeachersTable";

const PAGE_SIZE = 20;

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { filter, page: pageParam } = await searchParams;
  const showInactive = filter === "inactive";
  const page = Math.max(1, Number(pageParam) || 1);

  const listWhere = {
    siteId: DEFAULT_SITE_ID,
    accountStatus: showInactive ? { not: "ACTIVE" as const } : ("ACTIVE" as const),
  };

  const [teachers, matchingCount] = await Promise.all([
    prisma.teacher.findMany({
      where: listWhere,
      orderBy: { id: "desc" },
      select: { ...TEACHER_SUMMARY_SELECT, rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.teacher.count({ where: listWhere }),
  ]);
  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (showInactive) params.set("filter", "inactive");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/teachers?${qs}` : "/teachers";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">강사 관리</h1>
        <Link
          href="/teachers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 강사 등록
        </Link>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/teachers"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            !showInactive ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          활성 강사
        </Link>
        <Link
          href="/teachers?filter=inactive"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            showInactive ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          비활성/정지 강사
        </Link>
      </div>

      <TeachersTable
        showInactive={showInactive}
        teachers={teachers.map((t, i) => ({
          id: t.id,
          no: matchingCount - ((page - 1) * PAGE_SIZE + i),
          realName: t.realName,
          nickname: t.nickname,
          loginId: t.loginId,
          nationality: t.nationality,
          approvalStatus: t.approvalStatus,
          accountStatus: t.accountStatus,
          rateLabel: t.rates[0] ? `₱${t.rates[0].ratePerUnit.toString()}` : "-",
        }))}
      />

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
            {page} / {totalPages.toLocaleString()} 페이지 (총 {matchingCount.toLocaleString()}명)
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
