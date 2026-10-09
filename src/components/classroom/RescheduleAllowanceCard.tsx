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
  // 실제 계정은 서버가 정책(주2회=월1, 주3회=월2, 주5회=월3 × 등록 개월, 관리자 가감, 학원 휴강으로 대체된 연기 제외)으로 계산한 값을 그대로 쓴다.
  // 서버 값이 없는 데모/옛 응답일 때만 클라이언트 추정치를 쓴다.
  const estimated = computeRescheduleAllowance(enrollment, rescheduleRequests);
  const allowance = enrollment.leaveQuota
    ? { total: enrollment.leaveQuota.effectiveQuota, usedByStudent: enrollment.leaveQuota.usedCount, usedByAdmin: estimated.usedByAdmin }
    : estimated;

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
