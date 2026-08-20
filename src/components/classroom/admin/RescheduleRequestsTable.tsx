import { useTranslation } from "react-i18next";
import type { AdminRescheduleRow } from "../../../services/adminService";

function formatDateTime(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

export function RescheduleRequestsTable({ rows }: { rows: AdminRescheduleRow[] }) {
  const { t } = useTranslation("admin");
  const headers = t("reschedule.table_headers", { returnObjects: true }) as Record<string, string>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {Object.values(headers).map((h, i) => (
              <th
                key={i}
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
                {t("reschedule.no_rows")}
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
                <span className="font-semibold text-brand-700">{t(`reschedule.initiated_by_labels.${r.initiatedBy}`)}</span>
                {" · "}
                {t(`reschedule.cause_labels.${r.cause}`)}
                {r.reason && <span className="block text-slate-400">{t("reschedule.reason_label")}: {r.reason}</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                {formatDateTime(r.requestedAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] font-bold text-brand-950">
                {r.newDate}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                  {r.status === "applied" ? t("reschedule.status_applied") : t("reschedule.status_reverted")}
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
