import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Users } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { useLanguage } from "../../context/LanguageContext";
import { getLanguageCurrency } from "../../i18n/config";
import { formatPrice } from "../../data/currencies";
import { listPricing } from "../../services/pricingService";
import type { PricingDuration } from "../../data/pricing";

const DEFAULT_ACTIVE_DURATION_ID = "3m";

export function PricingSection({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  const { t } = useTranslation("home");
  const { lang } = useLanguage();
  const currency = getLanguageCurrency(lang) ?? "KRW";
  const [durations, setDurations] = useState<PricingDuration[]>([]);
  const [activeId, setActiveId] = useState(DEFAULT_ACTIVE_DURATION_ID);

  useEffect(() => {
    listPricing().then(setDurations);
  }, []);

  const active = durations.find((d) => d.id === activeId) ?? durations[0];

  return (
    <section className="bg-white">
      {/* hook — sells the feedback/growth-tracking value before the learner ever sees a
          price, so the table reads as "fair price for real value" instead of a cold list */}
      <div className="bg-brand-950 py-14 sm:py-16">
        <Container className="max-w-3xl text-center">
          <h2 className="text-2xl font-extrabold leading-snug text-white sm:text-3xl">
            {t("pricing.hook.headline")}
          </h2>
          <p className="mx-auto mt-5 max-w-xl whitespace-pre-line text-[14.5px] leading-relaxed text-white/70 sm:text-[15px]">
            {t("pricing.hook.body")}
          </p>
          <p className="mt-6 text-[13px] font-semibold text-accent-300 sm:text-sm">
            {t("pricing.hook.subline")}
          </p>
          <p className="mt-2 text-[13px] text-white/60 sm:text-sm">
            {t("pricing.hook.cta_lead")}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={onOpenLevelTest}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.35)] transition hover:-translate-y-0.5 hover:bg-accent-600 sm:w-auto"
            >
              <Sparkles size={16} /> {t("pricing.hook.cta_primary")}
            </button>
            <button
              onClick={() =>
                document.getElementById("instructors")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-white/10 sm:w-auto"
            >
              <Users size={16} /> {t("pricing.hook.cta_secondary")}
            </button>
          </div>
        </Container>
      </div>

      {!active ? null : (
        <Container id="pricing" className="py-12 sm:py-16">
          <SectionHeading
            eyebrow={t("pricing.eyebrow")}
            title={t("pricing.title")}
            description={t("pricing.description")}
          />

          {/* duration tabs */}
          <div className="mx-auto mt-10 flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-slate-100 p-1.5">
            {durations.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveId(d.id)}
                className={`relative flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                  activeId === d.id
                    ? "bg-white text-brand-700 shadow-[0_4px_14px_rgba(20,44,88,0.12)]"
                    : "text-slate-500 hover:text-brand-600"
                }`}
              >
                {t(`pricing.durations.${d.id}.label`)}
                {d.hasBadge && (
                  <span
                    className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      activeId === d.id
                        ? "bg-accent-500 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {t(`pricing.durations.${d.id}.badge`)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* price tables: 25min / 50min */}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {(
              [
                { key: "price25" as const, title: t("pricing.col_25min") },
                { key: "price50" as const, title: t("pricing.col_50min") },
              ]
            ).map((col) => (
              <div
                key={col.key}
                className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(20,44,88,0.06)]"
              >
                <div className="flex items-center justify-between bg-brand-950 px-6 py-4">
                  <h3 className="text-sm font-bold text-white">{col.title}</h3>
                  <span className="text-xs font-medium text-white/50">
                    {t("pricing.based_on", { label: t(`pricing.durations.${active.id}.label`) })}
                  </span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-accent-50">
                      <th className="px-6 py-3 text-left text-xs font-bold text-accent-700">
                        {t("pricing.table_header_type")}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-accent-700">
                        {t("pricing.table_header_fee")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.rows.map((row, i) => {
                      const price = (col.key === "price25" ? row.price25 : row.price50)[currency];
                      return (
                        <tr
                          key={row.frequencyId}
                          className={i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-slate-600">
                            {t(`pricing.frequency.${row.frequencyId}`)}
                          </td>
                          <td className="px-6 py-4 text-right text-base font-extrabold text-brand-950">
                            {price !== undefined ? formatPrice(price, currency) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4">
            <button
              onClick={onOpenLevelTest}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
            >
              <Sparkles size={16} /> {t("pricing.cta")}
            </button>
            <p className="text-center text-xs text-slate-400">
              {t("pricing.disclaimer")}
            </p>
          </div>
        </Container>
      )}
    </section>
  );
}
