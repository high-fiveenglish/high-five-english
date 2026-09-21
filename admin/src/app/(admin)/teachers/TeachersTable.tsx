"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DeleteButton } from "../DeleteButton";
import { AccountStatusSelect } from "./AccountStatusSelect";
import { ImpersonateButton } from "./ImpersonateButton";
import { deleteTeacher, bulkHardDeleteTeachers } from "./actions";
import type { AccountStatus } from "@/generated/prisma/client";

const APPROVAL_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려",
};

export type TeacherRow = {
  id: number;
  no: number;
  realName: string;
  nickname: string | null;
  loginId: string;
  nationality: string | null;
  approvalStatus: string;
  accountStatus: AccountStatus;
  rateLabel: string;
};

// 비활성/정지 탭에서만 체크박스로 여러 명을 골라 한 번에 완전삭제(하드 삭제)할 수 있게
// 한다 — 활성 강사를 실수로 지우는 일이 없도록 그 탭에는 일부러 넣지 않았다.
export function TeachersTable({
  teachers,
  showInactive,
}: {
  teachers: TeacherRow[];
  showInactive: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = teachers.length > 0 && teachers.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(teachers.map((t) => t.id)));

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    if (
      !confirm(
        `선택한 강사 ${selected.size}명을 완전히 삭제하시겠습니까?\n연결된 수강내역·수업기록도 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    const ids = [...selected];
    startTransition(() => {
      bulkHardDeleteTeachers(ids).then(() => setSelected(new Set()));
    });
  };

  return (
    <div>
      {showInactive && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selected.size === 0 || pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {pending ? "삭제 중..." : `선택 삭제 (${selected.size})`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              {showInactive && (
                <th className="px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="전체 선택" />
                </th>
              )}
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">실명</th>
              <th className="px-4 py-3">닉네임</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">로그인 ID</th>
              <th className="px-4 py-3">국적</th>
              <th className="px-4 py-3">승인 상태</th>
              <th className="px-4 py-3">계정 상태</th>
              <th className="px-4 py-3">현재 단가(25분)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                {showInactive && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                      aria-label={`${t.realName} 선택`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-slate-500">{t.no}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{t.realName}</td>
                <td className="px-4 py-3 text-slate-600">{t.nickname ?? "-"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {t.accountStatus === "ACTIVE" && <ImpersonateButton teacherId={t.id} teacherName={t.realName} />}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.loginId}</td>
                <td className="px-4 py-3 text-slate-600">{t.nationality ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{APPROVAL_LABEL[t.approvalStatus]}</td>
                <td className="px-4 py-3">
                  <AccountStatusSelect teacherId={t.id} accountStatus={t.accountStatus} />
                </td>
                <td className="px-4 py-3 text-slate-600">{t.rateLabel}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/teachers/${t.id}`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      수정
                    </Link>
                    {!showInactive && <DeleteButton action={deleteTeacher.bind(null, t.id)} />}
                  </div>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={showInactive ? 11 : 10} className="px-4 py-10 text-center text-slate-400">
                  {showInactive ? "비활성/정지 상태인 강사가 없습니다." : "등록된 강사가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
