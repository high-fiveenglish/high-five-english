import { useTranslation } from "react-i18next";
import { Mic2, ScrollText, HeartHandshake, Layers, BadgeDollarSign, MonitorPlay } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { ImageLightbox } from "./ImageLightbox";

const REASON_KEYS = [
  { key: "output", icon: Mic2 },
  { key: "experience", icon: ScrollText },
  { key: "trust", icon: HeartHandshake },
  { key: "feedback", icon: null }, // 실제 강사·학생 화상수업 화면 자리로 대체된 카드
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
              className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(20,44,88,0.12)]"
            >
              {r.icon === null ? (
                <>
                  <ImageLightbox label={t("whyUs.video_lesson_label")}>
                    <ImagePlaceholder
                      label={t("whyUs.video_lesson_label")}
                      aspect="16/10"
                      icon={MonitorPlay}
                      tone="accent"
                      className="rounded-none! border-x-0! border-t-0!"
                    />
                  </ImageLightbox>
                  <div className="p-6">
                    <h3 className="text-[15px] font-bold text-brand-950">{t(`whyUs.reasons.${r.key}.title`)}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                      {t(`whyUs.reasons.${r.key}.desc`)}
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
                    <r.icon size={20} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-bold text-brand-950">{t(`whyUs.reasons.${r.key}.title`)}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                    {t(`whyUs.reasons.${r.key}.desc`)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
