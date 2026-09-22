import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TERMINAL_PROGRESS_STATUSES } from "@/lib/levelTestOptions";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { parseAppDateTime, formatAppDate, appDayStart, appDayEnd } from "@/lib/appTime";
import { buildTeacherStats } from "@/lib/teacherStats";
import { closeExpiredEnrollments } from "@/lib/enrollmentLifecycle";

async function getCounts() {
  await closeExpiredEnrollments();
  // "오늘"은 서버 프로세스의 로컬 시간이 아니라 항상 Asia/Seoul 기준이어야 한다 — 그래야
  // 서버가 UTC로 떠 있어도 자정 경계가 실제 한국 시간과 어긋나지 않는다.
  const todayStart = appDayStart();
  const todayEnd = appDayEnd();

  const [students, teachers, activeEnrollments, pendingLevelTests, todaySessionRows, todayLeaveRequests] =
    await Promise.all([
      prisma.student.count({ where: { siteId: DEFAULT_SITE_ID, deletedAt: null } }),
      // 비활성/정지 강사(85명 중 72명)까지 다 세면 "지금 몇 명이 일하고 있나"라는 실제
      // 질문에 대한 답이 안 되므로, 활성 강사만 센다.
      prisma.teacher.count({ where: { siteId: DEFAULT_SITE_ID, accountStatus: "ACTIVE" } }),
      prisma.enrollment.count({
        where: { siteId: DEFAULT_SITE_ID, status: { in: ["ACTIVE", "PAID"] } },
      }),
      prisma.levelTest.count({
        where: { siteId: DEFAULT_SITE_ID, progressStatus: { notIn: [...TERMINAL_PROGRESS_STATUSES] } },
      }),
      prisma.classSession.findMany({
        where: { siteId: DEFAULT_SITE_ID, scheduledAt: { gte: todayStart, lt: todayEnd } },
        select: { teacherId: true, durationMin: true },
      }),
      // 학생이 직접 신청한 연기 + 관리자가 대신 등록한 연기를 합산한, 오늘 접수된 연기
      // 건수. 어학원 전체휴강(academyClosureId 있음)으로 한 번에 생긴 건은 개별 연기
      // 신청과 성격이 달라 제외한다.
      prisma.leaveRequest.count({
        where: {
          siteId: DEFAULT_SITE_ID,
          status: "APPROVED",
          academyClosureId: null,
          createdAt: { gte: todayStart, lt: todayEnd },
        },
      }),
    ]);

  // 수업 건수는 25분을 1건으로 놓고 환산한다 — 50분 수업은 25분 수업 2개 분량이라 2건으로 센다.
  const UNIT_MINUTES = 25;
  const sessionUnits = (durationMin: number) => durationMin / UNIT_MINUTES;
  const todaySessions = todaySessionRows.reduce((sum, s) => sum + sessionUnits(s.durationMin), 0);

  const unitsByTeacher = new Map<number, number>();
  for (const s of todaySessionRows) {
    unitsByTeacher.set(s.teacherId, (unitsByTeacher.get(s.teacherId) ?? 0) + sessionUnits(s.durationMin));
  }
  const teacherIds = [...unitsByTeacher.keys()];
  const teacherNames = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: TEACHER_SUMMARY_SELECT,
  });
  const teacherNameById = new Map(teacherNames.map((t) => [t.id, t.realName]));
  const teacherSessionsToday = [...unitsByTeacher.entries()]
    .map(([teacherId, count]) => ({ teacherName: teacherNameById.get(teacherId) ?? "알 수 없음", count }))
    .sort((a, b) => b.count - a.count);

  return {
    counts: { activeEnrollments, pendingLevelTests, todaySessions, todayLeaveRequests, students, teachers },
    teacherSessionsToday,
  };
}

// AGENT(협력사 관리자)용 홈 — 위 getCounts()와 같은 지표를 그 협력사(agentId) 학생에
// 한정해서 집계한다. 전사 통계(getCounts)와 나란히 두되 완전히 별도 함수로 둔 이유:
// 강사 수/강사수업통계처럼 협력사에 보여주면 안 되는 항목을 아예 쿼리하지 않기 위해서다.
async function getAgentCounts(agentId: number) {
  await closeExpiredEnrollments();
  const todayStart = appDayStart();
  const todayEnd = appDayEnd();

  const [students, activeEnrollments, pendingLevelTests, todaySessionRows, todayLeaveRequests] = await Promise.all([
    prisma.student.count({ where: { siteId: DEFAULT_SITE_ID, deletedAt: null, agentId } }),
    prisma.enrollment.count({ where: { siteId: DEFAULT_SITE_ID, status: { in: ["ACTIVE", "PAID"] }, agentId } }),
    prisma.levelTest.count({
      where: { siteId: DEFAULT_SITE_ID, progressStatus: { notIn: [...TERMINAL_PROGRESS_STATUSES] }, agentId },
    }),
    prisma.classSession.findMany({
      where: { siteId: DEFAULT_SITE_ID, scheduledAt: { gte: todayStart, lt: todayEnd }, student: { agentId } },
      select: { teacherId: true, durationMin: true },
    }),
    prisma.leaveRequest.count({
      where: {
        siteId: DEFAULT_SITE_ID,
        status: "APPROVED",
        academyClosureId: null,
        createdAt: { gte: todayStart, lt: todayEnd },
        student: { agentId },
      },
    }),
  ]);

  const UNIT_MINUTES = 25;
  const sessionUnits = (durationMin: number) => durationMin / UNIT_MINUTES;
  const todaySessions = todaySessionRows.reduce((sum, s) => sum + sessionUnits(s.durationMin), 0);

  const unitsByTeacher = new Map<number, number>();
  for (const s of todaySessionRows) {
    unitsByTeacher.set(s.teacherId, (unitsByTeacher.get(s.teacherId) ?? 0) + sessionUnits(s.durationMin));
  }
  const teacherIds = [...unitsByTeacher.keys()];
  const teacherNames = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: TEACHER_SUMMARY_SELECT,
  });
  const teacherNameById = new Map(teacherNames.map((t) => [t.id, t.realName]));
  const teacherSessionsToday = [...unitsByTeacher.entries()]
    .map(([teacherId, count]) => ({ teacherName: teacherNameById.get(teacherId) ?? "알 수 없음", count }))
    .sort((a, b) => b.count - a.count);

  return {
    counts: { activeEnrollments, pendingLevelTests, todaySessions, todayLeaveRequests, students },
    teacherSessionsToday,
  };
}

// 수업 관련 항목을 앞으로, 학생 수/강사 수는 참고용이라 뒤로 뺐다.
const CARDS = [
  { key: "activeEnrollments", label: "진행중 수강" },
  { key: "pendingLevelTests", label: "진행중 레벨테스트" },
  { key: "todaySessions", label: "오늘 수업 건수" },
  { key: "todayLeaveRequests", label: "오늘 연기 건수" },
  { key: "students", label: "학생 수" },
  { key: "teachers", label: "강사 수" },
] as const;

// AGENT 홈은 강사 수(전사 지표)가 없다.
const AGENT_CARDS = [
  { key: "activeEnrollments", label: "진행중 수강" },
  { key: "pendingLevelTests", label: "진행중 레벨테스트" },
  { key: "todaySessions", label: "오늘 수업 건수" },
  { key: "todayLeaveRequests", label: "오늘 연기 건수" },
  { key: "students", label: "학생 수" },
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

  // AGENT(협력사 관리자)는 전사(모든 협력사 합산) 통계는 볼 수 없으므로 그 화면 대신
  // 자기 협력사 학생에 한정된 홈을 별도로 렌더링한다(강사수업통계/강사 수 등 전사
  // 지표는 아예 쿼리하지 않는다 — getAgentCounts 참고).
  if (actor.role === "AGENT") {
    const { counts, teacherSessionsToday } = await getAgentCounts(actor.agentId);
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-slate-900">홈</h1>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {AGENT_CARDS.map((card) => (
            <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{counts[card.key]}</p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-slate-900">강사별 수업 회수 (오늘)</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">강사</th>
                  <th className="px-4 py-3">수업 건수</th>
                </tr>
              </thead>
              <tbody>
                {teacherSessionsToday.map((t) => (
                  <tr key={t.teacherName} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.teacherName}</td>
                    <td className="px-4 py-3 text-slate-600">{t.count}건</td>
                  </tr>
                ))}
                {teacherSessionsToday.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-slate-400">
                      오늘 예정된 수업이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  const canViewTeacherStats = actor.role === "ADMIN" || actor.permissions.includes("teacher_stats.view");

  const [{ counts, teacherSessionsToday }, { from, to }] = await Promise.all([getCounts(), searchParams]);

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

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">강사별 수업 회수 (오늘)</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">강사</th>
                <th className="px-4 py-3">수업 건수</th>
              </tr>
            </thead>
            <tbody>
              {teacherSessionsToday.map((t) => (
                <tr key={t.teacherName} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.teacherName}</td>
                  <td className="px-4 py-3 text-slate-600">{t.count}건</td>
                </tr>
              ))}
              {teacherSessionsToday.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-slate-400">
                    오늘 예정된 수업이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                      <th className="px-4 py-3">레이트(25분/₱)</th>
                      <th className="px-4 py-3">출석 회차</th>
                      <th className="px-4 py-3">결석 회차</th>
                      <th className="px-4 py-3">유급휴가 건수</th>
                      <th className="px-4 py-3">총 급여(₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statResult.summary.map((s) => (
                      <tr key={s.teacherName} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.teacherName}</td>
                        <td className="px-4 py-3 text-slate-600">₱{s.ratePerUnit.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600">{s.presentUnits}</td>
                        <td className="px-4 py-3 text-slate-600">{s.absentUnits}</td>
                        <td className="px-4 py-3 text-slate-600">{s.paidLeaveCount}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">₱{s.totalPayPHP.toLocaleString()}</td>
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
                      <th className="px-4 py-3">급여(₱)</th>
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
                        <td className="px-4 py-3 text-slate-600">₱{r.payPHP.toLocaleString()}</td>
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
