import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { DeleteButton } from "../DeleteButton";
import { ImpersonateButton } from "../students/ImpersonateButton";
import { PopupLink } from "./PopupLink";
import { deleteEnrollment } from "./actions";
import { StatusSelect } from "./StatusSelect";
import { RequestStatusSelect } from "./RequestStatusSelect";
import { FILTER_TABS, buildEnrollmentWhere } from "./filters";
import { formatScheduleDayTime } from "./scheduleUtils";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";
import { closeExpiredEnrollments } from "@/lib/enrollmentLifecycle";
import { requireBackofficeActor } from "@/lib/backofficeAuth";

const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: "미결제", PAID: "결제완료", FAILED: "결제실패" };
const PAYMENT_STATUS_CLASS: Record<string, string> = {
  UNPAID: "bg-slate-100 text-slate-500",
  PAID: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

// curriculumTrack은 "{ageGroup}:{field}" 형태로 저장된다(마케팅 사이트 src/data/
// curriculumTracks.ts와 동일한 값) — 예전 junior/senior/business 값이 붙은 과거
// 신청 건도 있을 수 있어 그쪽 라벨도 함께 남겨둔다.
const AGE_GROUP_LABEL: Record<string, string> = {
  preschool: "유아",
  elementary: "초등",
  secondary: "중고등",
  adult: "성인",
  junior: "주니어",
  senior: "성인",
  business: "비즈니스",
};
const FIELD_LABEL: Record<string, string> = {
  phonics: "파닉스",
  "basic-conversation": "기초 회화",
  "reading-smalltalk": "리딩·스몰토크",
  "native-reading": "원서 읽기",
  "conversation-debate": "회화·디베이트",
  "advanced-discussion": "고급 토론·에세이",
  exam: "시험 대비",
  business: "비즈니스 영어",
  expression: "표현력 강화",
  interview: "인터뷰 준비",
};
function trackLabel(track: string): string {
  const sepIndex = track.indexOf(":");
  if (sepIndex === -1) return AGE_GROUP_LABEL[track] ?? track;
  const ageGroup = track.slice(0, sepIndex);
  const field = track.slice(sepIndex + 1);
  return `${AGE_GROUP_LABEL[ageGroup] ?? ageGroup} · ${FIELD_LABEL[field] ?? field}`;
}
const REQUEST_DURATION_LABEL: Record<string, string> = { "1m": "1개월", "3m": "3개월", "6m": "6개월" };
const REQUEST_FREQUENCY_LABEL: Record<string, string> = { freq5: "주 5회", freq3: "주 3회", freq2: "주 2회" };
const REQUEST_PLATFORM_LABEL: Record<string, string> = { zoom: "Zoom", voov: "VooV", teams: "Teams" };
const CONSULT_ROUTE_LABEL: Record<string, string> = { WECHAT: "위챗", KAKAOTALK: "카카오톡" };

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const PAGE_SIZE = 20;

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const actor = await requireBackofficeActor();
  const scopeAgentId = actor.role === "AGENT" ? actor.agentId : undefined;
  const { filter, q, page: pageParam } = await searchParams;
  // 필터를 지정하지 않고 들어오면(메뉴 클릭 시 기본 진입) "진행중"을 기본으로 보여준다 —
  // 관리자가 매번 "전체"에서 다시 걸러야 했던 문제. 전체 목록은 "전체" 탭에서 명시적으로 본다.
  const effectiveFilter = filter ?? "active";
  const query = q?.trim();
  const page = Math.max(1, Number(pageParam) || 1);

  await closeExpiredEnrollments();

  const listWhere = {
    siteId: DEFAULT_SITE_ID,
    ...(scopeAgentId ? { agentId: scopeAgentId } : {}),
    ...buildEnrollmentWhere(effectiveFilter),
    ...(query
      ? {
          OR: [
            { student: { name: { contains: query, mode: "insensitive" as const } } },
            { student: { loginId: { contains: query, mode: "insensitive" as const } } },
            { agent: { name: { contains: query, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [enrollments, matchingCount, pendingRequests] = await Promise.all([
    prisma.enrollment.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      include: {
        student: true,
        teacher: { select: TEACHER_SUMMARY_SELECT },
        agent: true,
        renewals: { select: { id: true }, take: 1 },
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.enrollment.count({ where: listWhere }),
    // 마케팅 사이트에서 학생이 제출했지만 아직 관리자가 확인(연락완료/등록전환/취소)하지
    // 않은 수강신청 리드 — 필터와 무관하게 이 화면 맨 위에 "신청"으로 항상 노출한다.
    prisma.enrollmentRequest.findMany({
      where: {
        siteId: DEFAULT_SITE_ID,
        status: { in: ["NEW", "CONTACTED"] },
        ...(scopeAgentId ? { student: { agentId: scopeAgentId } } : {}),
      },
      orderBy: { id: "desc" },
      include: { student: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (effectiveFilter !== "active") params.set("filter", effectiveFilter);
    if (query) params.set("q", query);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/enrollments?${qs}` : "/enrollments";
  }

  // 출석/결석/잔여 회차는 ClassSession을 상태별로 묶어서 한 번에 집계한다(수강 건마다
  // 개별 쿼리를 날리지 않기 위함) — "결석"의 기준(MAKEUP_NEEDED)은 학생 강의실 화면의
  // 잔여 회차 계산(studentClassroom.ts)과 동일하게 맞췄다.
  const sessionCounts = await prisma.classSession.groupBy({
    by: ["enrollmentId", "status"],
    where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
    _count: true,
  });
  const attendanceByEnrollment = new Map<number, { present: number; absent: number }>();
  for (const row of sessionCounts) {
    const entry = attendanceByEnrollment.get(row.enrollmentId) ?? { present: 0, absent: 0 };
    if (row.status === "COMPLETED") entry.present += row._count;
    if (row.status === "MAKEUP_NEEDED") entry.absent += row._count;
    attendanceByEnrollment.set(row.enrollmentId, entry);
  }

  // 탭 옆 숫자 — 지금 몇 건이 각 상태에 있는지 한눈에 보이도록. 탭마다 조건이 달라(상태별,
  // 종료일 임박순 등) buildEnrollmentWhere를 그대로 재사용해 개별 count 쿼리를 병렬로 날린다.
  const tabCounts = Object.fromEntries(
    await Promise.all(
      FILTER_TABS.map(async (tab) => [
        tab.key,
        await prisma.enrollment.count({
          where: {
            siteId: DEFAULT_SITE_ID,
            ...(scopeAgentId ? { agentId: scopeAgentId } : {}),
            ...buildEnrollmentWhere(tab.key),
          },
        }),
      ]),
    ),
  ) as Record<string, number>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">수강내역관리</h1>
        <Link
          href="/enrollments/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 수강신청 등록
        </Link>
      </div>

      {pendingRequests.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-2xl border border-amber-200 bg-amber-50/40">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-amber-200 bg-amber-50 text-left text-xs font-semibold text-amber-800">
                <th className="px-4 py-3" />
                <th className="px-4 py-3">신청일시</th>
                <th className="px-4 py-3">학생</th>
                <th className="px-4 py-3">과정</th>
                <th className="px-4 py-3">기간</th>
                <th className="px-4 py-3">빈도/시간</th>
                <th className="px-4 py-3">희망 시작일</th>
                <th className="px-4 py-3">방식</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((r) => (
                <tr key={r.id} className="border-b border-amber-100 last:border-0">
                  <td className="px-4 py-3">
                    <span className="whitespace-nowrap rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white">
                      신청
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatAppDateTime(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="font-medium text-slate-900">{r.student.name}</p>
                    <p className="text-xs text-slate-400">{r.student.loginId}</p>
                  </td>
                  <td className="px-4 py-3">{trackLabel(r.curriculumTrack)}</td>
                  <td className="px-4 py-3">{REQUEST_DURATION_LABEL[r.durationId] ?? r.durationId}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {REQUEST_FREQUENCY_LABEL[r.lessonFrequency] ?? r.lessonFrequency} · {r.lessonDurationMin}분
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatAppDate(r.preferredStartDate)} {r.preferredStartTimeKST}
                  </td>
                  <td className="px-4 py-3">
                    {REQUEST_PLATFORM_LABEL[r.meetingPlatform] ?? r.meetingPlatform}
                    {r.teamsId && <span className="ml-1 text-xs text-slate-400">({r.teamsId})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <RequestStatusSelect id={r.id} status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/enrollments/new?fromRequest=${r.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      수정
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTER_TABS.map((tab) => {
          const active = effectiveFilter === tab.key;
          const params = new URLSearchParams();
          if (tab.key !== "active") params.set("filter", tab.key);
          if (query) params.set("q", query);
          const qs = params.toString();
          const href = qs ? `/enrollments?${qs}` : "/enrollments";
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {tab.label} ({(tabCounts[tab.key] ?? 0).toLocaleString()})
            </Link>
          );
        })}
      </div>

      <form className="mb-4 flex gap-2" method="get">
        {effectiveFilter !== "active" && <input type="hidden" name="filter" value={effectiveFilter} />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="학생 이름, 아이디 또는 협력사로 검색"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          검색
        </button>
        {query && (
          <Link
            href={effectiveFilter === "active" ? "/enrollments" : `/enrollments?filter=${effectiveFilter}`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:underline"
          >
            초기화
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">사이트</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">상담루트</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">패키지</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">요일/시간</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">총 회차</th>
              <th className="px-4 py-3">출결석</th>
              <th className="px-4 py-3">잔여 회차</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">결제</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e, i) => {
              const attendance = attendanceByEnrollment.get(e.id) ?? { present: 0, absent: 0 };
              const remaining = Math.max(0, e.totalSessions - attendance.present - attendance.absent);
              // 오래된 순 1부터의 일련번호 — 현재 필터·검색어에 맞는 전체 건수(matchingCount)에서
              // 페이지 오프셋을 더한 최신순 정렬상 위치를 빼서, 가장 오래된 건이 1번이 되게 한다.
              const no = matchingCount - ((page - 1) * PAGE_SIZE + i);
              return (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{no}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{e.agent?.name ?? "본사"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{e.student.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {e.student.consultRoute ? CONSULT_ROUTE_LABEL[e.student.consultRoute] : "-"}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <ImpersonateButton studentId={e.studentId} studentName={e.student.name} />
                    {/* 실제 수업이 있었거나 있는 건(진행중/종료)만 그대로 이어서 재수강 신청을
                        만들 수 있다 — 아직 접수만 된 건(APPLIED)은 재수강의 대상이 될 "기존
                        수강"이 아니다. 클릭하면 바로 만들어지지 않고, 기존 스케줄이 기본값으로
                        채워진 등록 화면(/enrollments/new)에서 관리자가 확인·수정한 뒤 저장해야
                        실제로 등록된다. 이미 재수강으로 이어진 건(renewals가 있음)은 중복 신청을
                        막기 위해 버튼 대신 "재수강 완료"만 표시한다. */}
                    {e.renewals.length > 0 ? (
                      <span className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400">재수강 완료</span>
                    ) : (
                      (e.status === "ACTIVE" || e.status === "COMPLETED") && (
                        <PopupLink
                          href={`/enrollments/new?renewFrom=${e.id}`}
                          windowName="renewEnrollmentPopup"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          재수강
                        </PopupLink>
                      )
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{e.teacher?.realName ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">{e.packageMonths}개월</td>
                <td className="px-4 py-3 text-slate-600">{e.classMethod}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatScheduleDayTime(e.scheduleDays, e.classTime, e.classTimes)}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {fmtDate(e.startDate)} ~ {fmtDate(e.endDate)}
                </td>
                <td className="px-4 py-3 text-slate-600">{e.totalSessions}회</td>
                <td className="px-4 py-3 text-slate-600">
                  출석 {attendance.present} · 결석 {attendance.absent}
                </td>
                <td className="px-4 py-3 text-slate-600">{remaining}회</td>
                <td className="px-4 py-3">
                  <StatusSelect id={e.id} status={e.status} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      PAYMENT_STATUS_CLASS[e.paymentStatus ?? "UNPAID"]
                    }`}
                  >
                    {PAYMENT_STATUS_LABEL[e.paymentStatus ?? "UNPAID"]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* 예전엔 진행중(ACTIVE) 건에서만 노출했지만, 신청/종료 등 다른 상태의
                        수강 건도 지난 수업 이력을 보거나 보충수업을 잡아야 할 수 있어 모든
                        상태에서 열 수 있게 했다. 목록 화면을 벗어나지 않도록 같은 탭이 아닌
                        별도 팝업 창으로 띄운다(PopupLink — 팝업이 차단되면 안내를 보여준다). */}
                    <PopupLink
                      href={`/students/${e.studentId}/sessions`}
                      windowName="classManagementPopup"
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      수업관리
                    </PopupLink>
                    <Link
                      href={`/enrollments/${e.id}/edit`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      수정
                    </Link>
                    <DeleteButton action={deleteEnrollment.bind(null, e.id)} />
                  </div>
                </td>
              </tr>
              );
            })}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-10 text-center text-slate-400">
                  해당하는 수강내역이 없습니다.
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
            {page} / {totalPages.toLocaleString()} 페이지 (총 {matchingCount.toLocaleString()}건)
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
