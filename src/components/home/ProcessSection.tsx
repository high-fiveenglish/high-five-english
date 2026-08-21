import { useTranslation } from "react-i18next";
import { PhoneCall, ClipboardList, UserCheck, PlayCircle } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";

const STEP_KEYS = [
  { key: "consult", icon: PhoneCall },
  { key: "leveltest", icon: ClipboardList },
  { key: "matching", icon: UserCheck },
  { key: "start", icon: PlayCircle },
] as const;

export function ProcessSection({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  const { t } = useTranslation("home");

  return (
    <section id="process" className="bg-brand-50/60 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("process.eyebrow")}
          title={t("process.title")}
          description={t("process.description")}
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_KEYS.map((step, i) => (
            <div key={step.key} className="relative">
              <div className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
                <span className="absolute -top-3.5 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="mt-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <step.icon size={22} />
                </div>
                <h3 className="mt-4 text-base font-bold text-brand-950">
                  {t(`process.steps.${step.key}.title`)}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  {t(`process.steps.${step.key}.desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <button
            onClick={onOpenLevelTest}
            className="rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            {t("process.cta")}
          </button>
        </div>
      </Container>
    </section>
  );
}
