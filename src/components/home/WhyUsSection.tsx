import { useTranslation } from "react-i18next";
import { Mic2, ScrollText, HeartHandshake, LineChart, Layers, BadgeDollarSign } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";

const REASON_KEYS = [
  { key: "output", icon: Mic2 },
  { key: "experience", icon: ScrollText },
  { key: "trust", icon: HeartHandshake },
  { key: "feedback", icon: LineChart },
  { key: "stages", icon: Layers },
  { key: "price", icon: BadgeDollarSign },
] as const;

export function WhyUsSection() {
  const { t } = useTranslation("home");

  return (
    <section className="bg-brand-50/60 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("whyUs.eyebrow")}
          title={t("whyUs.title")}
          description={t("whyUs.description")}
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {REASON_KEYS.map((r) => (
            <div
              key={r.key}
              className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(20,44,88,0.12)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
                <r.icon size={20} />
              </div>
              <h3 className="mt-4 text-[15px] font-bold text-brand-950">
                {t(`whyUs.reasons.${r.key}.title`)}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                {t(`whyUs.reasons.${r.key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
