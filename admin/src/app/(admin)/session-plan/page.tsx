import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { loadSessionPlan, type PlanDb } from "@/lib/sessionPlanData";
import { formatAppDateTime } from "@/lib/appTime";
import {
  EXCLUSION_REASON_LABEL,
  PLAN_ERROR_LABEL,
  PLAN_WARNING_LABEL,
  type ConflictGroup,
  type EnrollmentPlanRow,
  type Outcome,
} from "@/lib/sessionPlan";
import { WEEKDAYS } from "@/lib/weekdays";

// 수업 생성 Dry-run — 현재 ACTIVE 수강 건 기준으로 "앞으로 생성되어야 할 ClassSession"을 계산해 보여주기만 한다.
// 읽기 전용: 이 화면은 어떤 수업도 만들지 않고 수강 건도 바꾸지 않는다. 실제 생성은 CLI(scripts/generate-sessions.ts)로만,
// 허용 목록 + 계획 지문 게이트를 통과한 경우에만 이루어지고, 이 화면에는 생성 버튼이 없다(배치 이력만 읽기 전용으로 보여준다).
// 전 협력사의 수강/학생 정보를 한 화면에 보여주므로 ADMIN 전용이다(권한 테이블과 무관하게 role을 직접 확인).

export const dynamic = "force-dynamic";

const FILTERS: { key: "all" | Outcome; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "ELIGIBLE", label: "생성 가능" },
  { key: "CONFLICT", label: "충돌(보류)" },
  { key: "EXCLUDED", label: "제외" },
  { key: "ERROR", label: "오류" },
];

const OUTCOME_STYLE: Record<Outcome, string> = {
  ELIGIBLE: "bg-emerald-100 text-emerald-800",
  CONFLICT: "bg-amber-100 text-amber-800",
  EXCLUDED: "bg-slate-200 text-slate-700",
  ERROR: "bg-red-100 text-red-800",
};
const OUTCOME_LABEL: Record<Outcome, string> = { ELIGIBLE: "생성 가능", CONFLICT: "충돌(보류)", EXCLUDED: "제외", ERROR: "오류" };

function dayLabel(weekday: number): string {
  return WEEKDAYS.find((d) => d.value === weekday)?.label ?? "?";
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `${m}/${d}(${dayLabel(weekday)})`;
}

function conflictKindLabel(kind: ConflictGroup["kind"]): string {
  if (kind === "PLANNED_VS_PLANNED") return "다른 수강 건과 겹침";
  if (kind === "PLANNED_VS_EXISTING_SESSION") return "기존 수업과 겹침";
  return "레벨테스트와 겹침";
}

function Card({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function RowDetails({ row }: { row: EnrollmentPlanRow }) {
  return (
    <div className="space-y-3 text-xs text-slate-600">
      {row.errors.length > 0 && (
        <p className="text-red-700">
          오류: {row.errors.map((e) => `${PLAN_ERROR_LABEL[e.code]} (${e.detail})`).join(" / ")}
        </p>
      )}
      {row.reasons.length > 0 && <p>제외 사유: {row.reasons.map((r) => EXCLUSION_REASON_LABEL[r]).join(", ")}</p>}
      {row.warnings.length > 0 && <p className="text-amber-700">주의: {row.warnings.map((w) => PLAN_WARNING_LABEL[w]).join(", ")}</p>}

      {row.conflicts.length > 0 && (
        <div>
          <p className="font-semibold text-amber-800">강사 시간 충돌 — 자동 생성에서 제외됨(원인은 추측하지 않음)</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {row.conflicts.map((c, i) => (
              <li key={i}>
                {conflictKindLabel(c.kind)}: {c.otherLabel} · 매주 {dayLabel(c.weekday)} {c.time}({c.durationMin}분) ↔ {c.otherTime}({c.otherDurationMin}분) ·{" "}
                {c.dates.length}회 ({shortDate(c.dates[0])}
                {c.dates.length > 1 ? ` ~ ${shortDate(c.dates[c.dates.length - 1])}` : ""})
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.plannedSessions.length > 0 && (
        <div>
          <p className="font-semibold text-slate-800">
            {row.outcome === "CONFLICT" ? `보류된 후보 ${row.plannedSessions.length}건` : `생성 예정 ${row.plannedSessions.length}건`} (KST)
          </p>
          <p className="mt-1 leading-relaxed">
            {row.plannedSessions.map((p) => `${shortDate(p.date)} ${p.time}`).join(" · ")}
          </p>
        </div>
      )}

      {row.skippedPastDates.length > 0 && (
        <p>
          과거라 제외된 날짜 {row.skippedPastDates.length}건 ({shortDate(row.skippedPastDates[0])} ~{" "}
          {shortDate(row.skippedPastDates[row.skippedPastDates.length - 1])})
        </p>
      )}

      {row.skippedStartedToday.length > 0 && <p>오늘 이미 시작한(또는 지금 시작하는) 수업이라 만들지 않음: {row.skippedStartedToday.map(shortDate).join(", ")}</p>}

      {row.skippedPaidLeave.length > 0 && <p>담당 강사의 승인된 유급휴가일이라 만들지 않음: {row.skippedPaidLeave.map(shortDate).join(", ")}</p>}
      {row.skippedClosure.length > 0 && <p>휴강일이라 만들지 않음: {row.skippedClosure.map(shortDate).join(", ")} (종료일은 연장하지 않음)</p>}

      {row.timeVerification === "UNVERIFIED" && (
        <p className="text-amber-700">다요일 수강인데 요일별 시각(classTimes)이 확인되지 않아 실제 생성 대상에서 보류됩니다.</p>
      )}

      {row.skippedExisting.length > 0 && (
        <p>이미 세션이 있어 건너뜀: {row.skippedExisting.map((s) => `${shortDate(s.date)} (#${s.sessionId} ${s.status})`).join(", ")}</p>
      )}

      {row.alreadyExisting.length > 0 && (
        <div>
          <p className="font-semibold text-slate-800">이미 존재하는 세션</p>
          <ul className="mt-1 list-disc pl-5">
            {row.alreadyExisting.map((s) => (
              <li key={s.id}>
                #{s.id} · {shortDate(s.date)} {s.time} · {s.status}
                {s.isSupplement ? " · 보충수업(날짜를 막지 않음)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

async function loadRecentBatches() {
  return prisma.sessionGenerationBatch.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      mode: true,
      status: true,
      startedAt: true,
      asOfKstDate: true,
      plannedEnrollments: true,
      plannedSessions: true,
      createdSessions: true,
      conflictEnrollments: true,
      inactiveTeacherEnrollments: true,
      timeUnverifiedEnrollments: true,
      errorCount: true,
      failureReason: true,
      actorLabel: true,
    },
  });
}

export default async function SessionPlanPage({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") notFound();

  const { outcome: outcomeParam } = await searchParams;
  const filter = FILTERS.some((f) => f.key === outcomeParam) ? (outcomeParam as "all" | Outcome) : "all";

  // 앱 prisma는 재시도 로직을 얹은 $extends 클라이언트라 구조적 타입이 달라 단언한다(여기서는 findMany만 호출).
  const { rows, summary } = await loadSessionPlan(prisma as unknown as PlanDb);
  let batches: Awaited<ReturnType<typeof loadRecentBatches>> | null = null;
  try {
    batches = await loadRecentBatches();
  } catch {
    batches = null; // 마이그레이션 적용 전에는 배치 테이블이 없다 — 화면은 계속 동작해야 한다.
  }
  const activeRows = rows.filter((r) => r.status === "ACTIVE");
  const visible = filter === "all" ? activeRows : activeRows.filter((r) => r.outcome === filter);
  const excludedReasons = Object.entries(summary.excludedByReason);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">수업 생성 Dry-run</h1>
      <p className="mb-2 text-sm text-slate-500">
        진행중(ACTIVE) 수강 건을 기준으로 <b>앞으로 생성되어야 할 수업</b>을 계산해 보여줍니다. 기준일: {summary.todayKst} (KST) — 오늘 이전 날짜는 만들지 않으며,
        과거 수업을 완료로 소급하지 않습니다.
      </p>
      <p className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        읽기 전용 화면입니다. 이 화면은 수업을 생성하지 않고 수강 건도 수정하지 않습니다. 실제 생성은 별도 검토·승인 후 별도 단계에서 진행됩니다.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Card label="ACTIVE 수강" value={summary.totalActive} />
        <Card label="생성 가능" value={summary.eligible} />
        <Card label="충돌(보류)" value={summary.conflict} hint={`충돌 쌍 ${summary.conflictPairs} · 겹친 수업일 ${summary.conflictSlots}`} />
        <Card label="제외" value={summary.excluded} />
        <Card label="오류" value={summary.errors} />
        <Card label="생성 예정 세션" value={summary.sessionsWouldBeCreated} hint="생성 가능 건의 합계(시각 검증 전 포함)" />
        <Card label="실제 생성 대상" value={summary.generationSessions} hint={`수강 ${summary.generationEligible}건 · 시각 미검증 보류 ${summary.timeUnverifiedEnrollments}건(${summary.timeUnverifiedSessions}개)`} />
        <Card
          label="건너뛴 세션"
          value={summary.sessionsSkipped.total}
          hint={`과거 ${summary.sessionsSkipped.pastDates} · 오늘 시작 ${summary.sessionsSkipped.startedToday} · 휴강 ${summary.sessionsSkipped.closure} · 유급휴가 ${summary.sessionsSkipped.paidLeave} · 기존 ${summary.sessionsSkipped.alreadyExisting} · 충돌 보류 ${summary.sessionsSkipped.withheldByConflict}`}
        />
        <Card label="ACTIVE 아님(계산 제외)" value={summary.nonActiveExcluded} hint="HOLDING/APPLIED/PAID" />
      </div>
      {excludedReasons.length > 0 && (
        <p className="mb-6 text-xs text-slate-500">
          제외 사유: {excludedReasons.map(([k, n]) => `${EXCLUSION_REASON_LABEL[k as keyof typeof EXCLUSION_REASON_LABEL]} ${n}건`).join(" · ")}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/session-plan" : `/session-plan?outcome=${f.key}`}
            className={`rounded-lg border px-3 py-1.5 font-medium ${
              filter === f.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <span className="self-center text-xs text-slate-400">{visible.length}건 표시</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">수강</th>
              <th className="px-3 py-3">학생</th>
              <th className="px-3 py-3">강사</th>
              <th className="px-3 py-3">요일 · 시각</th>
              <th className="px-3 py-3">시간</th>
              <th className="px-3 py-3">기간</th>
              <th className="px-3 py-3 text-right">예정</th>
              <th className="px-3 py-3">결과</th>
              <th className="px-3 py-3">상세</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.enrollmentId} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-3 py-3 text-slate-500">#{r.enrollmentId}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{r.studentName}</td>
                <td className="px-3 py-3 text-slate-600">{r.teacherName ?? "-"}</td>
                <td className="px-3 py-3 text-slate-600">
                  {r.scheduleDays} · {r.classTime ?? "-"}
                  {r.classTimes && <span className="block text-[11px] text-slate-400">요일별: {Object.entries(r.classTimes).map(([d, t]) => `${dayLabel(Number(d))} ${t}`).join(", ")}</span>}
                </td>
                <td className="px-3 py-3 text-slate-600">{r.durationMin}분</td>
                <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                  {r.startDate} ~ {r.endDate}
                  <span className="block text-[11px] text-slate-400">총 {r.totalSessions}회</span>
                </td>
                <td className="px-3 py-3 text-right font-semibold text-slate-900">{r.outcome === "CONFLICT" ? `(${r.withheldCount})` : r.willCreateCount}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_STYLE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
                  {r.outcome === "ELIGIBLE" && !r.generationEligible && <span className="ml-1 text-xs font-semibold text-amber-700">시각 미검증</span>}
                  {r.warnings.length > 0 && <span className="ml-1 text-xs text-amber-600">주의 {r.warnings.length}</span>}
                </td>
                <td className="px-3 py-3">
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-sky-700">보기</summary>
                    <div className="mt-2 min-w-[22rem] max-w-xl">
                      <RowDetails row={r} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  해당하는 수강 건이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 text-base font-bold text-slate-900">수업 생성 배치 이력</h2>
      <p className="mb-3 text-xs text-slate-500">
        실제 생성은 이 화면이 아니라 CLI로만 실행되며, 실행할 때마다 배치가 기록됩니다(최근 10건, 읽기 전용).
      </p>
      {batches === null ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">배치 테이블이 아직 없습니다(마이그레이션 적용 전).</p>
      ) : batches.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">아직 실행된 배치가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left font-semibold text-slate-500">
                <th className="px-3 py-2">시작</th>
                <th className="px-3 py-2">모드</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">기준일</th>
                <th className="px-3 py-2 text-right">대상 수강</th>
                <th className="px-3 py-2 text-right">생성/예상</th>
                <th className="px-3 py-2 text-right">충돌</th>
                <th className="px-3 py-2 text-right">비활성 강사</th>
                <th className="px-3 py-2 text-right">시각 미검증</th>
                <th className="px-3 py-2 text-right">오류</th>
                <th className="px-3 py-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatAppDateTime(b.startedAt)}</td>
                  <td className="px-3 py-2 text-slate-600">{b.mode}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{b.status}</td>
                  <td className="px-3 py-2 text-slate-600">{b.asOfKstDate}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{b.plannedEnrollments}</td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {b.createdSessions}/{b.plannedSessions}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{b.conflictEnrollments}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{b.inactiveTeacherEnrollments}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{b.timeUnverifiedEnrollments}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{b.errorCount}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {b.actorLabel}
                    {b.failureReason ? ` · ${b.failureReason.slice(0, 80)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
