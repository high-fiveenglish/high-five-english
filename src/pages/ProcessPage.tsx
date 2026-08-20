import {
  UserPlus,
  ClipboardList,
  Video,
  FileCheck2,
  MessageCircle,
  CreditCard,
  CalendarCheck,
  GraduationCap,
  ChevronRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/seo/SeoHead";
import { PROCESS_STEPS } from "../data/process";

const STEP_ICONS = {
  UserPlus,
  ClipboardList,
  Video,
  FileCheck2,
  MessageCircle,
  CreditCard,
  CalendarCheck,
  GraduationCap,
} as const;

export function ProcessPage({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  const { t } = useTranslation("process");
  const reassurance = t("reassurance", { returnObjects: true }) as string[];

  return (
    <>
      <SeoHead titleKey="meta.title" descriptionKey="meta.description" ns="process" path="/process" />
      {/* hero */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white py-16 sm:py-20">
        <Container className="max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            {t("hero.eyebrow")}
          </span>
          <h1 className="mt-4 text-[1.9rem] font-extrabold leading-[1.3] text-brand-950 sm:text-4xl">
            {t("hero.headingLine1")}
            <br />
            {t("hero.headingLine2")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {t("hero.paragraph")}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {reassurance.map((r) => (
              <span
                key={r}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-700"
              >
                <CheckCircle2 size={15} className="text-brand-500" />
                {r}
              </span>
            ))}
          </div>

          <button
            onClick={onOpenLevelTest}
            className="mt-8 rounded-xl bg-accent-500 px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            {t("levelTestCta")}
          </button>
        </Container>

        {/* mini flow overview */}
        <Container className="mt-12 max-w-5xl">
          <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible">
            {PROCESS_STEPS.map((s, i) => (
              <div key={s.step} className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`step-${s.step}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="flex flex-col items-center gap-1.5 rounded-xl px-2.5 py-2 text-center transition hover:bg-white"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="max-w-[84px] text-[11px] font-semibold leading-tight text-brand-900 sm:max-w-none">
                    {t(`steps.${s.step}.title`)}
                  </span>
                </button>
                {i < PROCESS_STEPS.length - 1 && (
                  <ChevronRight size={16} className="mx-0.5 shrink-0 text-slate-300" />
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* detailed steps */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="relative space-y-6">
            <div className="absolute bottom-6 left-6 top-6 hidden w-px bg-brand-100 sm:block" />
            {PROCESS_STEPS.map((s) => {
              const Icon = STEP_ICONS[s.icon];
              const bullets = s.hasBullets
                ? (t(`steps.${s.step}.bullets`, { returnObjects: true }) as string[])
                : undefined;
              return (
                <div key={s.step} id={`step-${s.step}`} className="relative scroll-mt-28 sm:pl-16">
                  <div className="absolute left-0 top-0 hidden h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-base font-extrabold text-white sm:flex">
                    {s.step}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-extrabold text-white sm:hidden">
                        {s.step}
                      </span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <Icon size={19} />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-accent-500">
                          STEP {s.step}
                        </span>
                        <h3 className="text-lg font-bold text-brand-950">
                          {t(`steps.${s.step}.title`)}
                        </h3>
                      </div>
                    </div>

                    <p className="mt-3.5 text-[14.5px] leading-relaxed text-slate-600">
                      {t(`steps.${s.step}.desc`)}
                    </p>

                    {bullets && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {bullets.map((b) => (
                          <span
                            key={b}
                            className="rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-600"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}

                    {s.hasNote && (
                      <div className="mt-4 flex items-start gap-2 rounded-xl bg-accent-50/60 px-4 py-3">
                        <Sparkles size={14} className="mt-0.5 shrink-0 text-accent-500" />
                        <p className="text-[13px] font-medium leading-relaxed text-accent-700">
                          {t(`steps.${s.step}.note`)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* closing CTA */}
      <section className="bg-brand-950 py-16 text-center sm:py-24">
        <Container className="max-w-2xl">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
            {t("closing.heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
            {t("closing.paragraph")}
          </p>
          <button
            onClick={onOpenLevelTest}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent-500 px-9 py-4 text-base font-bold text-white shadow-[0_12px_28px_rgba(248,114,26,0.35)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            {t("levelTestCta")} <ChevronRight size={18} />
          </button>
        </Container>
      </section>
    </>
  );
}
