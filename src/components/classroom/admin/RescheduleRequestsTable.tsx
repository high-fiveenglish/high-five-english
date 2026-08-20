import type { AdminRescheduleRow } from "../../../services/adminService";

const CAUSE_LABELS: Record<AdminRescheduleRow["cause"], string> = {
  rescheduled: "학생 연기 신청",
  teacher_absent: "강사 결석",
  academy_closed: "학원 휴강",
  admin_cancelled: "관리자 취소",
};

const INITIATED_BY_LABELS: Record<AdminRescheduleRow["initiatedBy"], string> = {
  student: "학생",
  teacher: "강사",
  admin: "관리자",
};

function formatDateTime(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

export function RescheduleRequestsTable({ rows }: { rows: AdminRescheduleRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {[
              "학생명",
              "수업명",
              "원래 수업일",
              "신청 주체 · 사유",
              "신청일시",
              "변경된 수업일",
              "현재 상태",
              "종료일 변경 전 → 후",
            ].map((h) => (
              <th
                key={h}
                className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                연기 신청 내역이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-bold text-brand-950">
                {r.studentName}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{r.courseName}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                {r.originalDate}
              </td>
              <td className="px-4 py-3 text-[12.5px] text-slate-600">
                <span className="font-semibold text-brand-700">{INITIATED_BY_LABELS[r.initiatedBy]}</span>
                {" · "}
                {CAUSE_LABELS[r.cause]}
                {r.reason && <span className="block text-slate-400">사유: {r.reason}</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                {formatDateTime(r.requestedAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] font-bold text-brand-950">
                {r.newDate}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                  {r.status === "applied" ? "적용됨" : "취소됨"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                {r.endDateBefore} → <span className="font-bold text-brand-950">{r.endDateAfter}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
