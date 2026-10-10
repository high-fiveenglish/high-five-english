"use client";

import { useState, useTransition } from "react";
import { adjustEnrollmentLeaveQuota } from "./actions";

export type LeaveQuotaView = {
  policyQuota: number;
  adminAdjustment: number;
  effectiveQuota: number;
  usedCount: number;
  remainingCount: number;
};

// 학생 연기 횟수 — 서로 다른 다섯 값을 이름으로 구분해서 보여준다:
//   기본(정책: 주2회=월1, 주3회=월2, 주5회=월3 × 등록 개월, 주1·4·6·7회=0) + 관리자 조정 = 최종 적용, 최종 적용 − 사용 = 잔여.
// 조정은 이 화면에서 수정할 수 있고(본사 계정만), 이미 쓴 횟수보다 최종 적용이 작아지거나 음수가 되는 값은 서버가 거부한다.
export function LeaveQuotaCell({ enrollmentId, quota, canEdit }: { enrollmentId: number; quota: LeaveQuotaView; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [adjustment, setAdjustment] = useState(String(quota.adminAdjustment));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sign = quota.adminAdjustment > 0 ? "+" : "";
  const nextAdj = Number(adjustment);
  const nextEffective = Number.isInteger(nextAdj) ? quota.policyQuota + nextAdj : null;

  return (
    <div className="min-w-[210px] text-xs text-slate-600">
      <p>
        <span className="text-slate-400">잔여</span> <span className={`font-bold ${quota.remainingCount === 0 ? "text-red-600" : "text-emerald-700"}`}>{quota.remainingCount}회</span>
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        최종 적용 {quota.effectiveQuota}회 = 기본 {quota.policyQuota}회 {sign}
        {quota.adminAdjustment !== 0 ? `${quota.adminAdjustment}회(관리자 조정)` : "+ 관리자 조정 0회"}
        <br />
        사용 {quota.usedCount}회
      </p>
      {canEdit && !open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAdjustment(String(quota.adminAdjustment));
            setReason("");
            setError(null);
          }}
          className="mt-1 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          횟수 수정
        </button>
      )}
      {canEdit && open && (
        <div className="mt-1 space-y-1 rounded-lg border border-slate-200 bg-white p-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            관리자 조정(기본 {quota.policyQuota}회에 더하는 값)
            <input type="number" step={1} value={adjustment} onChange={(e) => setAdjustment(e.target.value)} className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-xs" />
          </label>
          <p className="text-[11px] text-slate-500">
            저장하면 최종 적용 {nextEffective ?? "?"}회, 이미 사용 {quota.usedCount}회 → 잔여 {nextEffective === null ? "?" : Math.max(0, nextEffective - quota.usedCount)}회
            {nextEffective !== null && nextEffective < quota.usedCount && <span className="ml-1 font-semibold text-red-600">(사용한 횟수보다 적어 저장할 수 없습니다)</span>}
            {nextEffective !== null && nextEffective < 0 && <span className="ml-1 font-semibold text-red-600">(0보다 작을 수 없습니다)</span>}
          </p>
          <input type="text" placeholder="사유(필수)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs" />
          <div className="flex gap-1.5">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              닫기
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await adjustEnrollmentLeaveQuota(enrollmentId, Number(adjustment), reason);
                  if (r?.error) setError(r.error);
                  else setOpen(false);
                });
              }}
              className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? "저장 중..." : "저장"}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
