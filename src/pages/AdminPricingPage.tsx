import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import { CURRENCIES } from "../data/currencies";
import { listPricing, updatePricingPrice } from "../services/pricingService";
import type { PricingDuration } from "../data/pricing";

function PriceCell({
  durationId,
  frequencyId,
  lessonLength,
  currency,
  value,
  onSaved,
}: {
  durationId: string;
  frequencyId: string;
  lessonLength: 25 | 50;
  currency: (typeof CURRENCIES)[number]["code"];
  value: number | undefined;
  onSaved: (durations: PricingDuration[]) => void;
}) {
  const { actor } = useAuth();
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  const handleBlur = async () => {
    if (!actor) return;
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0) {
      setDraft(String(value ?? ""));
      return;
    }
    if (amount === value) return;
    const result = await updatePricingPrice(actor, durationId, frequencyId, lessonLength, currency, amount);
    if (result.ok) onSaved(result.value);
  };

  return (
    <input
      type="number"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
    />
  );
}

function AdminPricingContent() {
  const { t } = useTranslation(["admin", "home"]);
  const [durations, setDurations] = useState<PricingDuration[]>([]);
  const [activeId, setActiveId] = useState("1m");

  useEffect(() => {
    listPricing().then(setDurations);
  }, []);

  const active = durations.find((d) => d.id === activeId);

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("pricing.admin_title")} align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {t("pricing.admin_description")}
        </p>

        <div className="mt-6 flex gap-2">
          {durations.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeId === d.id ? "bg-brand-600 text-white" : "bg-white text-slate-500 border border-slate-200"
              }`}
            >
              {t(`home:pricing.durations.${d.id}.label`)}
            </button>
          ))}
        </div>

        {active && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("pricing.class_column")}
                  </th>
                  {CURRENCIES.map((c) => (
                    <th
                      key={c.code}
                      className="whitespace-nowrap px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-slate-400"
                    >
                      {c.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([25, 50] as const).map((lessonLength) =>
                  active.rows.map((row) => (
                    <tr
                      key={`${lessonLength}-${row.frequencyId}`}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {t(`home:pricing.col_${lessonLength}min`)} · {t(`home:pricing.frequency.${row.frequencyId}`)}
                      </td>
                      {CURRENCIES.map((c) => (
                        <td key={c.code} className="px-4 py-2 text-right">
                          <PriceCell
                            durationId={active.id}
                            frequencyId={row.frequencyId}
                            lessonLength={lessonLength}
                            currency={c.code}
                            value={(lessonLength === 25 ? row.price25 : row.price50)[c.code]}
                            onSaved={setDurations}
                          />
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </section>
  );
}

export function AdminPricingPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="pricing"
      onOpenLogin={onOpenLogin}
    >
      <AdminPricingContent />
    </RouteGuard>
  );
}
