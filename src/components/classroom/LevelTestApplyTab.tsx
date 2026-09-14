import { useTranslation } from "react-i18next";
import { ClipboardCheck, Clock, LogIn } from "lucide-react";
import type { LevelTestEligibility } from "../../services/levelTestService";

export function LevelTestApplyTab({
  hasRealAccount,
  loading,
  eligibility,
  onOpenLevelTest,
  onViewResults,
}: {
  hasRealAccount: boolean;
  loading: boolean;
  eligibility: LevelTestEligibility | null;
  onOpenLevelTest: () => void;
  onViewResults: () => void;
}) {
  const { t } = useTranslation("classroom");

  if (!hasRealAccount) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          <LogIn size={26} />
        </div>
        <p className="text-sm leading-relaxed text-slate-500">{t("level_test_apply_tab.real_account_required")}</p>
      </div>
    );
  }

  if (loading || !eligibility) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <p className="text-sm text-slate-400">{t("page.loading")}</p>
      </div>
    );
  }

  if (eligibility.eligible) {
    return (
      <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-500">
          <ClipboardCheck size={26} />
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-slate-500">{t("level_test_apply_tab.eligible_desc")}</p>
        <button
          onClick={onOpenLevelTest}
          className="rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-600"
        >
          {t("level_test_apply_tab.cta")}
        </button>
      </div>
    );
  }

  if (eligibility.reason === "pending") {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Clock size={26} />
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-slate-500">{t("level_test_apply_tab.pending_desc")}</p>
        <button
          onClick={onViewResults}
          className="rounded-lg border border-slate-200 px-5 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
        >
          {t("level_test_apply_tab.view_results_cta")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Clock size={26} />
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-slate-500">
        {t("level_test_apply_tab.cooldown_desc", {
          lastConductedAt: eligibility.lastConductedAt,
          eligibleAt: eligibility.eligibleAt,
        })}
      </p>
      <button
        onClick={onViewResults}
        className="rounded-lg border border-slate-200 px-5 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
      >
        {t("level_test_apply_tab.view_results_cta")}
      </button>
    </div>
  );
}
