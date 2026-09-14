import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TERMINAL_PROGRESS_STATUSES } from "@/lib/levelTestOptions";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { parseAppDateTime, formatAppDate } from "@/lib/appTime";
import { buildTeacherStats } from "@/lib/teacherStats";

async function getCounts() {
  const [students, teachers, activeEnrollments, pendingLevelTests, todaySessions] =
    await Promise.all([
      prisma.student.count({ where: { siteId: DEFAULT_SITE_ID } }),
      prisma.teacher.count({ where: { siteId: DEFAULT_SITE_ID } }),
      prisma.enrollment.count({
        where: { siteId: DEFAULT_SITE_ID, status: { in: ["ACTIVE", "PAID"] } },
      }),
      prisma.levelTest.count({
        where: { siteId: DEFAULT_SITE_ID, progressStatus: { notIn: [...TERMINAL_PROGRESS_STATUSES] } },
      }),
      prisma.classSession.count({
        where: {
          siteId: DEFAULT_SITE_ID,
          scheduledAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(24, 0, 0, 0)),
          },
        },
      }),
    ]);

  return { students, teachers, activeEnrollments, pendingLevelTests, todaySessions };
}

const CARDS = [
  { key: "students", label: "학생 수" },
  { key: "teachers", label: "강사 수" },
  { key: "activeEnrollments", label: "진행중 수강" },
  { key: "pendingLevelTests", label: "진행중 레벨테스트" },
  { key: "todaySessions", label: "오늘 수업 건수" },
] as const;

function todayIsoDate(): string {
  return formatAppDate(new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const actor = await requireBackofficeActor();
  const canViewTeacherStats = actor.role === "ADMIN" || actor.permissions.includes("teacher_stats.view");

  const [counts, { from, to }] = await Promise.all([getCounts(), searchParams]);

  const RAW_ROW_PREVIEW_LIMIT = 500;
  let statResult: Awaited<ReturnType<typeof buildTeacherStats>> | null = null;
  if (canViewTeacherStats && from && to) {
    const fromDate = parseAppDateTime(`${from}T00:00`);
    const toDate = parseAppDateTime(`${to}T00:00`);
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    statResult = await buildTeacherStats(fromDate, toDate);
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">대시보드</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((card) => (
          <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{counts[card.key]}</p>
          </div>
        ))}
      </div>

      {canViewTeacherStats && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-900">강사수업통계</h2>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">시작일</label>
              <input
                type="date"
                name="from"
                defaultValue={from ?? todayIsoDate()}
                max={todayIsoDate()}
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">종료일</label>
              <input
                type="date"
                name="to"
                defaultValue={to ?? todayIsoDate()}
                max={todayIsoDate()}
                required
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              조회
            </button>
            {from && to && (
              <a
                href={`/api/teacher-stats/export?from=${from}&to=${to}`}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                엑셀 다운로드
              </a>
            )}
          </form>

          {statResult && (
            <>
              <div className="mb-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">강사명</th>
                      <th className="px-4 py-3">레이트(25분/원)</th>
                      <th className="px-4 py-3">출석 회차</th>
                      <th className="px-4 py-3">결석 회차</th>
                      <th className="px-4 py-3">유급휴가 건수</th>
                      <th className="px-4 py-3">총 급여(원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statResult.summary.map((s) => (
                      <tr key={s.teacherName} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.teacherName}</td>
                        <td className="px-4 py-3 text-slate-600">{s.ratePerUnit.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600">{s.presentUnits}</td>
                        <td className="px-4 py-3 text-slate-600">{s.absentUnits}</td>
                        <td className="px-4 py-3 text-slate-600">{s.paidLeaveCount}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{s.totalPayKRW.toLocaleString()}</td>
                      </tr>
                    ))}
                    {statResult.summary.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                          해당 기간에 진행된 수업이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-3">강사명</th>
                      <th className="px-4 py-3">학생명(영어이름)</th>
                      <th className="px-4 py-3">수업일자</th>
                      <th className="px-4 py-3">출결석</th>
                      <th className="px-4 py-3">시간(분)</th>
                      <th className="px-4 py-3">협력사</th>
                      <th className="px-4 py-3">수업종류</th>
                      <th className="px-4 py-3">급여(원)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statResult.rows.slice(0, RAW_ROW_PREVIEW_LIMIT).map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 text-slate-900">{r.teacherName}</td>
                        <td className="px-4 py-3 text-slate-600">{r.studentLabel}</td>
                        <td className="px-4 py-3 text-slate-500">{r.dateLabel}</td>
                        <td className="px-4 py-3 text-slate-600">{r.attendance}</td>
                        <td className="px-4 py-3 text-slate-600">{r.durationMin}</td>
                        <td className="px-4 py-3 text-slate-600">{r.agentName}</td>
                        <td className="px-4 py-3 text-slate-600">{r.sessionUnits}</td>
                        <td className="px-4 py-3 text-slate-600">{r.payKRW.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {statResult.rows.length > RAW_ROW_PREVIEW_LIMIT && (
                  <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
                    화면에는 최근 {RAW_ROW_PREVIEW_LIMIT}건만 미리보기로 표시됩니다. 전체{" "}
                    {statResult.rows.length.toLocaleString()}건은 엑셀 다운로드로 확인해주세요.
                  </p>
                )}
                {statResult.rows.length === 0 && (
                  <p className="px-4 py-10 text-center text-slate-400">해당 기간에 진행된 수업이 없습니다.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
