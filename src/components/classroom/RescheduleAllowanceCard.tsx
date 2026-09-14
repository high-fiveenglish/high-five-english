import { useTranslation } from "react-i18next";
import { CalendarCheck, CalendarClock, ShieldCheck } from "lucide-react";
import type { Enrollment, RescheduleRequest } from "../../lib/scheduling/types";
import { computeRescheduleAllowance } from "../../lib/scheduling/rescheduleAllowance";

export function RescheduleAllowanceCard({
  enrollment,
  rescheduleRequests,
}: {
  enrollment: Enrollment;
  rescheduleRequests: RescheduleRequest[];
}) {
  const { t } = useTranslation("classroom");
  const allowance = computeRescheduleAllowance(enrollment, rescheduleRequests);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <h3 className="text-sm font-bold text-brand-950">{t("reschedule_allowance.title")}</h3>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-brand-50/60 p-3">
          <CalendarCheck size={16} className="mx-auto text-brand-600" />
          <p className="mt-1.5 text-sm font-extrabold text-brand-950">
            {t("reschedule_allowance.count_value", { count: allowance.total })}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">{t("reschedule_allowance.total")}</p>
        </div>
        <div className="rounded-xl bg-brand-50/60 p-3">
          <CalendarClock size={16} className="mx-auto text-brand-600" />
          <p className="mt-1.5 text-sm font-extrabold text-brand-950">
            {t("reschedule_allowance.count_value", { count: allowance.usedByStudent })}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">{t("reschedule_allowance.used_by_student")}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <ShieldCheck size={16} className="mx-auto text-slate-500" />
          <p className="mt-1.5 text-sm font-extrabold text-brand-950">
            {t("reschedule_allowance.count_value", { count: allowance.usedByAdmin })}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">{t("reschedule_allowance.used_by_admin")}</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{t("reschedule_allowance.admin_note")}</p>
    </div>
  );
}
