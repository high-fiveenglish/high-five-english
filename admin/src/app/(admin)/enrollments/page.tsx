import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { DeleteButton } from "../DeleteButton";
import { ImpersonateButton } from "../students/ImpersonateButton";
import { deleteEnrollment, renewEnrollment } from "./actions";
import { StatusSelect } from "./StatusSelect";
import { RequestStatusSelect } from "./RequestStatusSelect";
import { FILTER_TABS, buildEnrollmentWhere } from "./filters";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";

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

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;
  // 필터를 지정하지 않고 들어오면(메뉴 클릭 시 기본 진입) "진행중"을 기본으로 보여준다 —
  // 관리자가 매번 "전체"에서 다시 걸러야 했던 문제. 전체 목록은 "전체" 탭에서 명시적으로 본다.
  const effectiveFilter = filter ?? "active";
  const query = q?.trim();

  const [enrollments, pendingRequests] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        siteId: DEFAULT_SITE_ID,
        ...buildEnrollmentWhere(effectiveFilter),
        ...(query
          ? {
              student: {
                OR: [{ name: { contains: query, mode: "insensitive" } }, { loginId: { contains: query, mode: "insensitive" } }],
              },
            }
          : {}),
      },
      orderBy: { id: "desc" },
      include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
      take: 300,
    }),
    // 마케팅 사이트에서 학생이 제출했지만 아직 관리자가 확인(연락완료/등록전환/취소)하지
    // 않은 수강신청 리드 — 필터와 무관하게 이 화면 맨 위에 "신청"으로 항상 노출한다.
    prisma.enrollmentRequest.findMany({
      where: { siteId: DEFAULT_SITE_ID, status: { in: ["NEW", "CONTACTED"] } },
      orderBy: { id: "desc" },
      include: { student: true },
    }),
  ]);

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
              {tab.label}
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
          placeholder="학생 이름 또는 아이디로 검색"
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">패키지</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">요일</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">총 회차</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">결제</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{e.student.name}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ImpersonateButton studentId={e.studentId} studentName={e.student.name} />
                </td>
                <td className="px-4 py-3 text-slate-600">{e.teacher?.realName ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">{e.packageMonths}개월</td>
                <td className="px-4 py-3 text-slate-600">{e.classMethod}</td>
                <td className="px-4 py-3 text-slate-600">{e.scheduleDays}</td>
                <td className="px-4 py-3 text-slate-500">
                  {fmtDate(e.startDate)} ~ {fmtDate(e.endDate)}
                </td>
                <td className="px-4 py-3 text-slate-600">{e.totalSessions}회</td>
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
                    {/* 실제로 수업이 진행 중인(진행중=ACTIVE) 수강 건에서만 수업관리로
                        들어갈 수 있다 — 접수/종료/이탈 등은 아직 진행할 실제 수업이
                        없거나 더 이상 없으므로 여기서 굳이 노출하지 않는다. */}
                    {e.status === "ACTIVE" && (
                      <Link
                        href={`/students/${e.studentId}/sessions`}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        수업관리
                      </Link>
                    )}
                    <Link
                      href={`/enrollments/${e.id}/edit`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      수정
                    </Link>
                    {/* 실제 수업이 있었거나 있는 건(진행중/종료)만 그대로 이어서 재수강
                        신청을 만들 수 있다 — 아직 접수만 된 건(APPLIED)은 재수강의
                        대상이 될 "기존 수강"이 아니다. */}
                    {(e.status === "ACTIVE" || e.status === "COMPLETED") && (
                      <form action={renewEnrollment.bind(null, e.id)}>
                        <button
                          type="submit"
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          재수강
                        </button>
                      </form>
                    )}
                    <DeleteButton action={deleteEnrollment.bind(null, e.id)} />
                  </div>
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                  해당하는 수강내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
