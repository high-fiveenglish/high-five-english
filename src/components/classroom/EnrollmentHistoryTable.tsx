import { useTranslation } from "react-i18next";
import { Printer, FileCheck } from "lucide-react";
import type { EnrollmentHistoryRow } from "../../services/classroomService";

export function EnrollmentHistoryTable({
  rows,
  onOpenReceipt,
  onOpenCertificate,
}: {
  rows: EnrollmentHistoryRow[];
  onOpenReceipt: (row: EnrollmentHistoryRow) => void;
  onOpenCertificate: (row: EnrollmentHistoryRow) => void;
}) {
  const { t } = useTranslation("classroom");

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            <th className="w-14 whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              No
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {t("history_table.headers.name")}
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {t("history_table.headers.period")}
            </th>
            <th className="w-28 whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {t("history_table.headers.receipt")}
            </th>
            <th className="w-28 whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {t("history_table.headers.certificate")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                {t("history_table.empty")}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.enrollment.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
              <td className="px-4 py-3 font-mono text-[12px] text-slate-400">{rows.length - i}</td>
              <td className="px-4 py-3 text-sm font-semibold text-brand-950">{row.displayName}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                {row.enrollment.startDate} ~ {row.enrollment.endDate}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <button
                  onClick={() => onOpenReceipt(row)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                >
                  <Printer size={13} /> {t("history_table.headers.receipt")}
                </button>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <button
                  onClick={() => onOpenCertificate(row)}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                >
                  <FileCheck size={13} /> {t("history_table.headers.certificate")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
