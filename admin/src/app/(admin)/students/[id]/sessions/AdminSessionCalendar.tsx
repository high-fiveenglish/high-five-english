"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { formatAppDate, formatAppTime } from "@/lib/appTime";
import {
  addSupplementSession,
  adjustStudentLeaveQuota,
  applyStudentLeave,
  applyAdminLeave,
  cancelSession,
  resetEvaluation,
  revertCancelSession,
  getAvailableTeachersForSlot,
} from "./actions";
import { revertLeaveRequest } from "../../../leave-requests/actions";

// 아침 6시~밤 12시 사이, 30분 간격 시간대 목록 ("06:00", "06:30", ... "23:30").
const TIME_SLOT_OPTIONS: string[] = [];
for (let mins = 6 * 60; mins < 24 * 60; mins += 30) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  TIME_SLOT_OPTIONS.push(`${h}:${m}`);
}

export type CalendarSession = {
  id: number;
  scheduledAt: Date;
  durationMin: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MAKEUP_NEEDED" | "LEAVE" | "HOLD";
  teacherName: string;
  evaluationId: number | null;
  leaveReason: string | null;
  leaveRequestId: number | null;
  isSupplement: boolean;
  enrollmentId: number;
  /** 평가 상태: NONE(연기 가능) / HAS_EVALUATION(평가서·녹음 결과가 있어 초기화 후 연기) / AI_PROCESSING(처리 중이라 초기화·연기 불가) */
  evaluationState: "NONE" | "HAS_EVALUATION" | "AI_PROCESSING";
  relatedSessionId: number | null;
};

/** 수강건별 학생 연기 횟수(lib/leavePolicy.ts의 summarizeLeaveQuota 결과) */
export type QuotaInfo = {
  enrollmentId: number;
  label: string;
  policyQuota: number;
  adminAdjustment: number;
  effectiveQuota: number;
  usedCount: number;
  remainingCount: number;
};

type EnrollmentOption = {
  id: number;
  label: string;
  classDurationMin: number;
  hasTeacher: boolean;
};

const STATUS_LABEL: Record<CalendarSession["status"], string> = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  MAKEUP_NEEDED: "보충필요",
  LEAVE: "휴강",
  HOLD: "홀드",
};

const STATUS_STYLE: Record<CalendarSession["status"], string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-slate-200 text-slate-600",
  CANCELLED: "bg-red-100 text-red-600",
  MAKEUP_NEEDED: "bg-amber-100 text-amber-700",
  LEAVE: "bg-purple-100 text-purple-600",
  HOLD: "bg-orange-100 text-orange-700",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const fmtDate = formatAppDate;
const fmtTime = formatAppTime;

function dateKey(d: Date) {
  return formatAppDate(d);
}

export function AdminSessionCalendar({
  studentId,
  sessions,
  enrollments,
  quotas,
}: {
  studentId: number;
  sessions: CalendarSession[];
  enrollments: EnrollmentOption[];
  quotas: QuotaInfo[];
}) {
  const today = new Date();
  const initial = sessions.find((s) => s.scheduledAt >= today) ?? sessions[sessions.length - 1] ?? { scheduledAt: today };
  const [initialYear, initialMonth] = formatAppDate(initial.scheduledAt).split("-").map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth - 1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const byDay = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const key = dateKey(s.scheduledAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <QuotaPanel studentId={studentId} quotas={quotas} />
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          + 대체수업 추가
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const d = new Date(viewYear, viewMonth - 1, 1);
              setViewYear(d.getFullYear());
              setViewMonth(d.getMonth());
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            ← 이전 달
          </button>
          <p className="text-sm font-bold text-slate-900">
            {viewYear}.{String(viewMonth + 1).padStart(2, "0")}
          </p>
          <button
            type="button"
            onClick={() => {
              const d = new Date(viewYear, viewMonth + 1, 1);
              setViewYear(d.getFullYear());
              setViewMonth(d.getMonth());
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            다음 달 →
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddSupplementForm
          studentId={studentId}
          enrollments={enrollments}
          relatedOptions={sessions
            .filter((s) => !s.isSupplement && s.status !== "CANCELLED")
            .map((s) => ({ id: s.id, enrollmentId: s.enrollmentId, label: `${fmtDate(s.scheduledAt)} ${fmtTime(s.scheduledAt)} (${STATUS_LABEL[s.status]})` }))}
          onDone={() => setShowAddForm(false)}
        />
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 font-semibold text-slate-400">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const daySessions = byDay.get(dateKey(d)) ?? [];
          const isToday = dateKey(d) === dateKey(today);
          return (
            <div
              key={i}
              className={`min-h-[68px] rounded-lg border p-1 text-left ${
                isToday ? "border-slate-400 bg-slate-50" : "border-slate-100"
              }`}
            >
              <p className="text-[11px] text-slate-400">{d.getDate()}</p>
              {daySessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`mt-0.5 block w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight ${
                    selectedId === s.id ? "bg-slate-900 text-white" : `${STATUS_STYLE[s.status]} hover:brightness-95`
                  }`}
                >
                  {fmtTime(s.scheduledAt)} {s.teacherName}
                  {s.status !== "SCHEDULED" && (
                    <span
                      className={`ml-1 rounded px-1 py-0.5 text-[9px] font-bold ${
                        selectedId === s.id ? "bg-white/20 text-white" : "bg-white/60 text-slate-700"
                      }`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  )}
                  {s.isSupplement && (
                    <span
                      className={`ml-1 rounded px-1 py-0.5 text-[9px] font-bold ${
                        selectedId === s.id ? "bg-amber-300 text-amber-950" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      보충
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {selected && (
        <SessionDetail
          key={selected.id}
          studentId={studentId}
          session={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function SessionDetail({
  studentId,
  session,
  onClose,
}: {
  studentId: number;
  session: CalendarSession;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revertConfirming, setRevertConfirming] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"studentLeave" | "adminLeave" | "cancel" | "resetEvaluation" | null>(null);
  const isFuture = session.scheduledAt.getTime() >= Date.now();
  // 관리자 화면의 연기는 시간 제한이 없다(학생 직접 신청의 2시간 제한은 학생 화면에만 있다).
  //  - 학생수업연기: 예정(SCHEDULED) 수업 — 학생 연기 횟수를 차감한다.
  //  - 관리자수업연기: 평가서가 없는 모든 수업(예정/완료/보충필요, 과거·오늘·미래) — 횟수를 차감하지 않는다.
  //  - 평가서/녹음 결과가 있으면 평가 초기화(녹음 원본은 보존)를 먼저 해야 한다. AI 분석 중이면 초기화도 연기도 불가.
  const leavable = session.status === "SCHEDULED" || session.status === "COMPLETED" || session.status === "MAKEUP_NEEDED";
  const canStudentLeave = session.status === "SCHEDULED" && session.evaluationState === "NONE";
  const canAdminLeave = leavable && session.evaluationState === "NONE";
  const needsReset = leavable && session.evaluationState === "HAS_EVALUATION";
  const aiBusy = leavable && session.evaluationState === "AI_PROCESSING";
  const canCancel = session.status === "SCHEDULED" && isFuture;
  const canAct = canStudentLeave || canAdminLeave || needsReset || aiBusy || canCancel;

  function run(action: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  // 학생연기/관리자연기/수업취소를 눌렀을 때 실행되는 실제 처리 — cancelSession은
  // throw로 실패를 알리므로, applyStudentLeave/applyAdminLeave의 {error} 반환 방식과
  // 맞춰 여기서 한 번에 흡수한다(run()의 error 상태로 그대로 보여줄 수 있도록).
  async function runConfirmedAction(action: "studentLeave" | "adminLeave" | "cancel" | "resetEvaluation"): Promise<{ error?: string } | void> {
    try {
      if (action === "studentLeave") return await applyStudentLeave(studentId, session.id, reason);
      if (action === "adminLeave") return await applyAdminLeave(studentId, session.id, reason);
      if (action === "resetEvaluation") return await resetEvaluation(studentId, session.id, reason);
      await cancelSession(studentId, session.id);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "처리 중 오류가 발생했습니다." };
    }
  }

  const CONFIRM_COPY: Record<"studentLeave" | "adminLeave" | "cancel" | "resetEvaluation", string> = {
    studentLeave:
      "학생수업연기로 처리합니다. 학생의 연기 가능 횟수에서 차감됩니다(관리자가 대신 실행하므로 2시간 제한은 없습니다). 연기된 수업은 정규 수업 시퀀스를 한 칸 뒤로 밀어 다음 유효 정규 슬롯에 배치되고, 수강 종료일이 마지막 정규 수업 날짜까지 늘어납니다. 진행할까요?",
    adminLeave:
      "관리자수업연기로 처리합니다. 학생의 연기 가능 횟수에서 차감되지 않습니다. 연기된 수업은 정규 수업 시퀀스를 한 칸 뒤로 밀어 다음 유효 정규 슬롯에 배치되고, 수강 종료일이 마지막 정규 수업 날짜까지 늘어납니다. 진행할까요?",
    cancel: "이 수업을 취소합니다. 진행할까요?",
    resetEvaluation:
      "이 수업의 평가서와 AI 평가 결과(초안·QC)를 초기화합니다. 녹음 원본과 전사는 삭제되지 않습니다. 초기화 후에 연기할 수 있습니다. 사유를 꼭 입력해 주세요. 진행할까요?",
  };

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">
          수업 상세
          {session.isSupplement && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              보충수업
            </span>
          )}
        </p>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
          닫기
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <InfoItem label="수업 날짜" value={fmtDate(session.scheduledAt)} />
        <InfoItem label="수업 시간" value={`${fmtTime(session.scheduledAt)} (${session.durationMin}분)`} />
        <InfoItem label="강사" value={session.teacherName} />
        <InfoItem
          label="수업 상태"
          value={STATUS_LABEL[session.status]}
          badgeClass={STATUS_STYLE[session.status]}
        />
      </div>

      {session.status === "LEAVE" && session.leaveReason && (
        <p className="mt-2 text-xs text-slate-500">연기 사유: {session.leaveReason}</p>
      )}

      {/* 휴강 취소(되돌리기)/수업취소 되돌리기는 관리자(백오피스)만 접근 가능한 이
          화면에서만 노출된다 — 강사/학생 화면에는 이 버튼 자체가 없다. 학생연기든
          관리자연기든 되돌리면 leave-requests/actions.ts의 revertLeaveRequest가
          LeaveRequest 레코드를 통째로 지우므로, "학생이 쓴 연기 횟수"를 이 테이블로
          집계하는 곳이 있다면 자동으로 복구된다. 수업취소는 애초에 LeaveRequest나
          수강 종료일 연장을 건드리지 않았으므로 되돌릴 때도 상태만 SCHEDULED로
          되돌리면 된다(revertCancelSession). */}
      {/* window.confirm()은 이 앱을 미리보기하는 일부 브라우저 환경(예: 자동화 도구의
          내장 브라우저)에서 항상 취소로 응답하도록 막혀 있어, 그런 환경에서는 버튼을
          눌러도 아무 반응이 없는 것처럼 보일 수 있다 — 그래서 네이티브 confirm() 대신
          인라인 확인 UI를 쓴다(회원 삭제 버튼과 동일한 방식). */}
      {((session.status === "LEAVE" && session.leaveRequestId) || session.status === "CANCELLED") && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          {!revertConfirming ? (
            <button
              type="button"
              onClick={() => setRevertConfirming(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
            >
              {session.status === "LEAVE" ? "휴강 취소(되돌리기)" : "취소 취소(되돌리기)"}
            </button>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs text-slate-600">
                {session.status === "LEAVE"
                  ? "휴강 처리를 취소하고 수업을 다시 예정 상태로 되돌립니다. 연장됐던 수강 종료일도 원래대로 줄어듭니다. 계속할까요?"
                  : "수업 취소를 되돌려 다시 예정 상태로 되돌립니다. 계속할까요?"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setRevertConfirming(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      try {
                        if (session.status === "LEAVE") {
                          await revertLeaveRequest(session.leaveRequestId!);
                        } else {
                          await revertCancelSession(studentId, session.id);
                        }
                        setRevertConfirming(false);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
                      }
                    });
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {pending ? "처리 중..." : "확인"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {session.status === "COMPLETED" && (
        <p className="mt-3 text-xs">
          <Link href={`/evaluations/${session.evaluationId ?? session.id}`} className="font-semibold text-blue-700 hover:underline">
            {session.evaluationId ? "평가서 보기/수정 (Modify)" : "평가서 작성 (Modify)"}
          </Link>
        </p>
      )}

      {aiBusy && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          이 수업의 녹음을 AI가 분석 중이라 평가 초기화와 연기를 할 수 없습니다. 분석이 끝난 뒤 다시 시도해 주세요.
        </p>
      )}
      {session.relatedSessionId !== null && (
        <p className="mt-2 text-xs text-slate-400">관련 수업 #{session.relatedSessionId} ({session.isSupplement ? "관련 정규 수업" : "연기된 원 수업"})</p>
      )}
      {canAct && !aiBusy && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="사유 (선택)"
            className="mb-2 w-full max-w-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
          />
          {!confirmAction ? (
            <div className="flex flex-wrap gap-2">
              {canStudentLeave && (
                <button
                  type="button"
                  onClick={() => setConfirmAction("studentLeave")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  학생수업연기
                </button>
              )}
              {canAdminLeave && (
                <button
                  type="button"
                  onClick={() => setConfirmAction("adminLeave")}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  관리자수업연기
                </button>
              )}
              {needsReset && (
                <button
                  type="button"
                  onClick={() => setConfirmAction("resetEvaluation")}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  평가 초기화 (연기 전 필수)
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setConfirmAction("cancel")}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  수업취소
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs text-slate-600">{CONFIRM_COPY[confirmAction]}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmAction(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const action = confirmAction;
                    run(async () => {
                      const result = await runConfirmedAction(action);
                      if (!result?.error) setConfirmAction(null);
                      return result;
                    });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                    confirmAction === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-700"
                  }`}
                >
                  {pending ? "처리 중..." : "확인"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

// 수강건별 학생 연기 횟수 요약 + 관리자 가감. 정책: 주2회=월1, 주3회=월2, 주5회=월3 × 등록 개월 수, 등록기간 전체 기준(월별 reset 없음).
function QuotaPanel({ studentId, quotas }: { studentId: number; quotas: QuotaInfo[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [adjustment, setAdjustment] = useState("0");
  const [reason, setReason] = useState("");
  if (quotas.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-bold text-slate-700">학생 연기 횟수 (등록기간 전체 기준)</p>
      <div className="space-y-2">
        {quotas.map((q) => (
          <div key={q.enrollmentId} className="text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-medium text-slate-800">{q.label}</span>
              <span>기본 {q.policyQuota}회</span>
              <span>관리자 가감 {q.adminAdjustment >= 0 ? "+" : ""}{q.adminAdjustment}회</span>
              <span className="font-semibold">허용 {q.effectiveQuota}회</span>
              <span>사용 {q.usedCount}회</span>
              <span className={q.remainingCount === 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>남은 {q.remainingCount}회</span>
              <button
                type="button"
                onClick={() => {
                  setEditing(editing === q.enrollmentId ? null : q.enrollmentId);
                  setAdjustment(String(q.adminAdjustment));
                  setReason("");
                  setError(null);
                }}
                className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-white"
              >
                횟수 수정
              </button>
            </div>
            {editing === q.enrollmentId && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
                <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                  가감 횟수(기본 {q.policyQuota}회에 더하는 값)
                  <input type="number" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-xs" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-slate-500">
                  사유(필수)
                  <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="w-56 rounded border border-slate-300 px-2 py-1 text-xs" />
                </label>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await adjustStudentLeaveQuota(studentId, q.enrollmentId, Number(adjustment), reason);
                      if (r?.error) setError(r.error);
                      else setEditing(null);
                    });
                  }}
                  className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {pending ? "저장 중..." : "저장"}
                </button>
                <span className="text-[11px] text-slate-400">이미 사용한 횟수({q.usedCount}회)보다 작게는 낮출 수 없습니다.</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function AddSupplementForm({
  studentId,
  enrollments,
  relatedOptions,
  onDone,
}: {
  studentId: number;
  enrollments: EnrollmentOption[];
  relatedOptions: { id: number; enrollmentId: number; label: string }[];
  onDone: () => void;
}) {
  const boundAction = addSupplementSession.bind(null, studentId);
  const [state, formAction, pending] = useActionState(boundAction, undefined);
  const defaultEnrollment = enrollments.find((e) => e.hasTeacher) ?? enrollments[0];
  const [enrollmentId, setEnrollmentId] = useState<string>(String(defaultEnrollment?.id ?? ""));

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMin, setDurationMin] = useState(defaultEnrollment?.classDurationMin === 50 ? "50" : "25");
  const [availableTeachers, setAvailableTeachers] = useState<{ id: number; label: string }[]>([]);
  const [teacherId, setTeacherId] = useState<string>("");
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  const scheduledAt = date && time ? `${date}T${time}` : "";

  useEffect(() => {
    if (!scheduledAt) {
      setAvailableTeachers([]);
      setTeacherId("");
      return;
    }
    let cancelled = false;
    setLoadingTeachers(true);
    getAvailableTeachersForSlot(scheduledAt, Number(durationMin))
      .then((teachers) => {
        if (cancelled) return;
        setAvailableTeachers(teachers);
        setTeacherId((prev) => (teachers.some((t) => String(t.id) === prev) ? prev : (teachers[0]?.id.toString() ?? "")));
      })
      .finally(() => {
        if (!cancelled) setLoadingTeachers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scheduledAt, durationMin]);

  if (enrollments.length === 0) {
    return (
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        진행 중인 수강신청이 없어 대체수업을 추가할 수 없습니다.
      </p>
    );
  }

  return (
    <form action={formAction} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="scheduledAt" value={scheduledAt} />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">수강신청</label>
        <select
          name="enrollmentId"
          value={enrollmentId}
          onChange={(e) => setEnrollmentId(e.target.value)}
          className="w-64 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
        >
          {enrollments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">관련 정규 수업 (선택)</label>
        <select
          name="relatedSessionId"
          defaultValue=""
          className="w-56 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
        >
          <option value="">없음</option>
          {relatedOptions
            .filter((o) => String(o.enrollmentId) === enrollmentId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">수업 날짜</label>
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">수업 시간</label>
        <select
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
        >
          <option value="">선택</option>
          {TIME_SLOT_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">수업 시간(분)</label>
        <select
          name="durationMin"
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
        >
          <option value="25">25분</option>
          <option value="50">50분</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">담당 강사 (해당 시간 가능한 강사만)</label>
        <select
          name="teacherId"
          required
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          disabled={!scheduledAt || loadingTeachers}
          className="w-48 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
        >
          {!scheduledAt ? (
            <option value="">날짜·시간을 먼저 선택</option>
          ) : loadingTeachers ? (
            <option value="">조회 중...</option>
          ) : availableTeachers.length === 0 ? (
            <option value="">가능한 강사 없음</option>
          ) : (
            availableTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))
          )}
        </select>
      </div>
      {state?.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !teacherId}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "추가 중..." : "추가"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function InfoItem({ label, value, badgeClass }: { label: string; value: string; badgeClass?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {badgeClass ? (
        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>{value}</span>
      ) : (
        <p className="mt-0.5 font-medium text-slate-900">{value}</p>
      )}
    </div>
  );
}
