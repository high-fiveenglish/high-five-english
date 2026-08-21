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

/** One step's icon tile — a small numbered badge pinned on the icon (not the icon
 * itself being the number) gives the number → icon → label hierarchy its own visual
 * tier at each size, and is reused identically by both the desktop single-row layout
 * and the tablet/mobile grid layout below so they never drift out of sync. */
function MiniStepButton({
  index,
  icon: Icon,
  title,
  onClick,
}: {
  index: number;
  icon: (typeof STEP_ICONS)[keyof typeof STEP_ICONS];
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-2.5 rounded-2xl px-2 py-2.5 text-center transition hover:bg-white"
    >
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-100 sm:h-[4.5rem] sm:w-[4.5rem]">
          <Icon size={28} className="sm:hidden" />
          <Icon size={32} className="hidden sm:block" />
        </div>
        <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-extrabold text-white ring-[3px] ring-white">
          {index + 1}
        </span>
      </div>
      <span className="max-w-[110px] text-[13.5px] font-bold leading-snug text-brand-900 sm:max-w-[7.5rem] sm:text-[15px]">
        {title}
      </span>
    </button>
  );
}

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

        {/* mini flow overview — a single row on desktop so the whole 8-step flow reads
            left-to-right at a glance, but a 2/4-column grid below lg: cramming 8 items
            into one row only works with room per item to spare, which phones and even
            most tablets don't have; a grid lets each icon stay full-size instead. */}
        <Container className="mt-12 max-w-7xl">
          <div className="hidden lg:flex lg:items-start lg:justify-between">
            {PROCESS_STEPS.map((s, i) => (
              <div key={s.step} className="flex flex-1 items-start justify-center">
                <MiniStepButton
                  index={i}
                  icon={STEP_ICONS[s.icon]}
                  title={t(`steps.${s.step}.title`)}
                  onClick={() =>
                    document
                      .getElementById(`step-${s.step}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
                {i < PROCESS_STEPS.length - 1 && (
                  <ChevronRight size={22} className="mt-7 shrink-0 text-slate-300" />
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-4 sm:gap-x-4 lg:hidden">
            {PROCESS_STEPS.map((s, i) => (
              <MiniStepButton
                key={s.step}
                index={i}
                icon={STEP_ICONS[s.icon]}
                title={t(`steps.${s.step}.title`)}
                onClick={() =>
                  document
                    .getElementById(`step-${s.step}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              />
            ))}
          </div>
        </Container>
      </section>

      {/* detailed steps */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="relative space-y-7 sm:space-y-8">
            <div className="absolute bottom-6 left-6 top-6 hidden w-px bg-brand-100 sm:block" />
            {PROCESS_STEPS.map((s) => {
              const Icon = STEP_ICONS[s.icon];
              const bullets = s.hasBullets
                ? (t(`steps.${s.step}.bullets`, { returnObjects: true }) as string[])
                : undefined;
              return (
                <div key={s.step} id={`step-${s.step}`} className="relative sm:pl-16">
                  <div className="absolute left-0 top-0 hidden h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-base font-extrabold text-white sm:flex">
                    {s.step}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-extrabold text-white sm:hidden">
                        {s.step}
                      </span>
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 sm:h-16 sm:w-16">
                        <Icon size={28} />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-accent-500">
                          STEP {s.step}
                        </span>
                        <h3 className="text-lg font-bold text-brand-950 sm:text-xl">
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
