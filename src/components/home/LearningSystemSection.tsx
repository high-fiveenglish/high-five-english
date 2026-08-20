import { useTranslation } from "react-i18next";
import { DoorOpen, FileCheck2, TrendingUp, ArrowRight } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";

const ITEM_KEYS = [
  { key: "classroom", icon: DoorOpen },
  { key: "report", icon: FileCheck2 },
  { key: "levelcheck", icon: TrendingUp },
] as const;

export function LearningSystemSection() {
  const { t } = useTranslation("home");

  return (
    <section
      id="learning-system"
      className="scroll-mt-28 bg-brand-950 py-20 text-white sm:py-24"
    >
      <Container>
        <SectionHeading
          eyebrow={t("learningSystem.eyebrow")}
          title={t("learningSystem.title")}
          description={t("learningSystem.description")}
          light
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {ITEM_KEYS.map((item) => (
            <div
              key={item.key}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400">
                <item.icon size={22} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">
                {t(`learningSystem.items.${item.key}.title`)}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-white/60">
                {t(`learningSystem.items.${item.key}.desc`)}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-white/40 transition group-hover:text-accent-300">
                {t("learningSystem.more_link")} <ArrowRight size={13} />
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
