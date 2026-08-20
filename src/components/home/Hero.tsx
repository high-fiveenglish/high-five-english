import { useTranslation } from "react-i18next";
import { Star, ShieldCheck, Users2 } from "lucide-react";
import { Container } from "../ui/Container";
import { LocalizedLink } from "../i18n/LocalizedLink";

export function Hero({ onOpenLevelTest }: { onOpenLevelTest: () => void }) {
  const { t } = useTranslation("home");

  const feedbackRows = [
    { label: t("hero.demo.row1_label"), value: t("hero.demo.row1_value") },
    { label: t("hero.demo.row2_label"), value: t("hero.demo.row2_value") },
    { label: t("hero.demo.row3_label"), value: t("hero.demo.row3_value") },
    { label: t("hero.demo.row4_label"), value: t("hero.demo.row4_value") },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-100 opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-40 h-72 w-72 rounded-full bg-brand-100 opacity-70 blur-3xl" />

      <Container className="relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            <ShieldCheck size={14} /> {t("hero.badge")}
          </span>

          <h1 className="mt-5 text-[2rem] font-extrabold leading-[1.25] text-brand-950 sm:text-[2.5rem] lg:text-[2.75rem]">
            {t("hero.headline.line1")}
            <br />
            <span className="text-brand-600">{t("hero.headline.emphasis1")}</span>{" "}
            {t("hero.headline.line2_rest")}
            <br />
            1:1 <span className="text-accent-500">{t("hero.headline.emphasis2")}</span>
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {t("hero.subtext")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onOpenLevelTest}
              className="rounded-xl bg-accent-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
            >
              {t("hero.cta_primary")}
            </button>
            <LocalizedLink
              to="/process"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-brand-950 transition hover:-translate-y-0.5 hover:border-brand-300"
            >
              {t("hero.cta_secondary")}
            </LocalizedLink>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-slate-100 pt-6 text-center sm:text-left">
            <div>
              <dt className="text-[11px] font-medium text-slate-400">{t("hero.stats.experience_label")}</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">{t("hero.stats.experience_value")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">{t("hero.stats.teacher_label")}</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">{t("hero.stats.teacher_value")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">{t("hero.stats.growth_label")}</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">{t("hero.stats.growth_value")}</dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_24px_60px_rgba(20,44,88,0.14)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-brand-950">{t("hero.demo.title")}</p>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600">
                2026.08.19
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {feedbackRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-xs text-slate-400">{row.label}</span>
                  <span className="text-xs font-semibold text-brand-900">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-1 rounded-xl bg-accent-50 px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14} className="fill-accent-400 text-accent-400" />
              ))}
              <span className="ml-2 text-xs font-semibold text-accent-600">
                {t("hero.demo.comment")}
              </span>
            </div>
          </div>

          <div className="absolute -bottom-5 -left-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_14px_34px_rgba(20,44,88,0.16)]">
            <Users2 size={18} className="text-brand-600" />
            <span className="text-xs font-bold text-brand-950">
              {t("hero.demo.badge")}
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
