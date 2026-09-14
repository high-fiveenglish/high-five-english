import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, LogIn } from "lucide-react";
import type { MyLevelTestRow } from "../../services/levelTestService";
import { LevelTestResultContent } from "./LevelTestResultContent";
import { LevelTestRadarChart, LevelTestRadarLegend } from "./LevelTestRadarChart";

const STATUS_BADGE_CLASS: Record<string, string> = {
  접수: "bg-white/10 text-[#c7d2c9]",
  수업확정: "bg-[#3462a3]/30 text-[#a9c3e8]",
  수업완료: "bg-emerald-500/20 text-emerald-300",
  결석: "bg-red-500/20 text-red-300",
  취소: "bg-white/10 text-[#8f978f]",
};

function langLabel(code: string | null): string {
  switch (code) {
    case "ko":
      return "한국어";
    case "zh":
      return "中文";
    case "vi":
      return "Tiếng Việt";
    case "ja":
      return "日本語";
    default:
      return "";
  }
}

// admin(성장 리포트)의 LevelTestResultView와 같은 레이아웃 — 진한 헤더 밴드 + 추천
// 레벨·교재 타일 + 레이더 차트 + 영역별 색상 리포트. "오늘 적용한 성장 리포트"를
// 마케팅 사이트에서도 똑같이 쓴다는 요청에 따라 admin과 동일한 색상·구조로 맞췄다.
function LevelTestGrowthCard({ row }: { row: MyLevelTestRow }) {
  const { t } = useTranslation("classroom");
  const [open, setOpen] = useState(true);
  const hasTranslation = Boolean(row.resultContentTranslated && row.resultContentTranslatedLang);
  const [showEnglish, setShowEnglish] = useState(!hasTranslation);
  const scores = row.scores;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-3 bg-[#232b26] px-5 py-4 text-left text-[#f2f4f0]"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_BADGE_CLASS[row.progressStatus] ?? "bg-white/10 text-[#c7d2c9]"}`}>
            {t(`level_test_status.${row.progressStatus}`, { defaultValue: row.progressStatus })}
          </span>
          <span className="text-sm font-bold">{row.scheduledTestDate ?? row.appliedAt}</span>
          {row.teacherName && <span className="text-xs text-[#9fb0a3]">{row.teacherName}</span>}
        </div>
        <ChevronDown size={18} className={`shrink-0 text-[#9fb0a3] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="bg-white">
          {(row.recommendedLevel || row.recommendedTextbook) && (
            <div className="grid grid-cols-1 divide-y divide-slate-100 border-b border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="px-5 py-4">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#3462a3]">
                  {t("level_test_result_tab.recommended_level")}
                </p>
                <p className="text-2xl font-extrabold text-[#1c2a3d]">{row.recommendedLevel || "—"}</p>
              </div>
              <div className="px-5 py-4">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#8a5a1f]">
                  {t("level_test_result_tab.recommended_textbook")}
                </p>
                <p className="text-sm font-bold text-[#2f2417]">{row.recommendedTextbook || "—"}</p>
              </div>
            </div>
          )}

          {scores && (
            <div className="grid grid-cols-1 items-center gap-6 border-b border-slate-100 px-5 py-6 sm:grid-cols-[200px_1fr]">
              <LevelTestRadarChart scores={scores} />
              <LevelTestRadarLegend scores={scores} vertical />
            </div>
          )}

          <div className="px-5 py-5">
            {row.resultContent ? (
              <>
                {hasTranslation && (
                  <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
                    <button
                      onClick={() => setShowEnglish(false)}
                      className={`rounded-full px-3 py-1 transition ${!showEnglish ? "bg-[#232b26] text-white" : "text-slate-500"}`}
                    >
                      {langLabel(row.resultContentTranslatedLang)}
                    </button>
                    <button
                      onClick={() => setShowEnglish(true)}
                      className={`rounded-full px-3 py-1 transition ${showEnglish ? "bg-[#232b26] text-white" : "text-slate-500"}`}
                    >
                      English
                    </button>
                  </div>
                )}
                <LevelTestResultContent content={showEnglish ? row.resultContent : row.resultContentTranslated!} />
              </>
            ) : (
              <p className="text-sm text-slate-400">{t("level_test_result_tab.not_written")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LevelTestResultTab({
  hasRealAccount,
  loading,
  tests,
}: {
  hasRealAccount: boolean;
  loading: boolean;
  tests: MyLevelTestRow[];
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

  if (loading) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <p className="text-sm text-slate-400">{t("page.loading")}</p>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
        <p className="text-sm text-slate-400">{t("level_test_result_tab.empty")}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {tests.map((row) => (
        <LevelTestGrowthCard key={row.id} row={row} />
      ))}
    </div>
  );
}
