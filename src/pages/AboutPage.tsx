import { useTranslation } from "react-i18next";
import {
  Ear,
  Lightbulb,
  Brain,
  MessageCircle,
  PenLine,
  RotateCw,
  Quote,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { FaqAccordion, type FaqEntry } from "../components/ui/FaqAccordion";
import { SeoHead } from "../components/seo/SeoHead";
import { OUTPUT_STEPS } from "../data/aboutContent";

const STEP_ICONS = {
  Ear,
  Lightbulb,
  Brain,
  MessageCircle,
  PenLine,
  RotateCw,
} as const;

export function AboutPage() {
  const { t } = useTranslation("about");

  const ceoParagraphs1 = t("ceo_letter.paragraphs_1", {
    returnObjects: true,
  }) as string[];
  const ceoParagraphs2 = t("ceo_letter.paragraphs_2", {
    returnObjects: true,
  }) as string[];
  const ceoQuestions = t("ceo_letter.questions", {
    returnObjects: true,
  }) as string[];
  const ceoParagraphs3 = t("ceo_letter.paragraphs_3", {
    returnObjects: true,
  }) as string[];
  const trustParagraphs = t("trust_section.paragraphs", {
    returnObjects: true,
  }) as string[];
  const philosophyParagraphs = t("philosophy_section.paragraphs", {
    returnObjects: true,
  }) as string[];
  const philosophyClosingParagraphs = t(
    "philosophy_section.closing_paragraphs",
    { returnObjects: true }
  ) as string[];
  const parentFaqItems = t("parent_faq.items", {
    returnObjects: true,
  }) as FaqEntry[];
  const feedbackItems = t("feedback_system.items", {
    returnObjects: true,
  }) as string[];

  return (
    <>
      <SeoHead titleKey="meta.title" descriptionKey="meta.description" ns="about" path="/about" />
      {/* page header */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white py-14 sm:py-16">
        <Container className="text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            {t("page_header.eyebrow")}
          </span>
          <h1 className="mt-4 text-[1.75rem] font-extrabold leading-tight text-brand-950 sm:text-3xl">
            {t("page_header.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
            {t("page_header.subtitle")}
          </p>
        </Container>
      </section>

      {/* CEO letter */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white">
              {t("ceo_letter.avatar_initial")}
            </div>
            <div>
              <p className="text-sm font-bold text-brand-950">
                {t("ceo_letter.author_label")}
              </p>
              <p className="text-xs text-slate-400">
                {t("ceo_letter.author_sub")}
              </p>
            </div>
          </div>

          <div className="space-y-5 text-[15.5px] leading-[1.9] text-slate-600">
            {ceoParagraphs1.map((p) => (
              <p key={p}>{p}</p>
            ))}

            <blockquote className="rounded-2xl border-l-4 border-accent-400 bg-accent-50/60 px-5 py-4 text-[15.5px] font-bold leading-relaxed text-brand-950">
              {t("ceo_letter.pull_quote")}
            </blockquote>

            {ceoParagraphs2.map((p) => (
              <p key={p}>{p}</p>
            ))}

            <ul className="space-y-2.5 rounded-2xl bg-brand-50/60 p-5">
              {ceoQuestions.map((q) => (
                <li key={q} className="flex items-start gap-2.5 text-[14.5px] text-brand-900">
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-brand-500" />
                  {q}
                </li>
              ))}
            </ul>

            {ceoParagraphs3.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>

          <div className="mt-8 text-right text-sm text-slate-400">
            {t("ceo_letter.signoff_label")}
            <br />
            <span className="text-base font-bold text-brand-950">
              {t("ceo_letter.signoff_name")}
            </span>
          </div>
        </Container>
      </section>

      {/* trust */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <Quote size={26} className="text-brand-300" fill="currentColor" />
          <h2 className="mt-4 text-xl font-bold text-brand-950 sm:text-2xl">
            {t("trust_section.title")}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.9] text-slate-600">
            {trustParagraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Container>
      </section>

      {/* philosophy + output flow */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <h2 className="text-xl font-bold text-brand-950 sm:text-2xl">
            {t("philosophy_section.title")}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.9] text-slate-600">
            {philosophyParagraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Container>

        <Container className="mt-10">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-1 gap-y-6">
            {OUTPUT_STEPS.map((step, i) => {
              const Icon = STEP_ICONS[step.icon];
              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600">
                      <Icon size={24} />
                    </div>
                    <span className="text-xs font-bold text-brand-950">
                      {t(`output_steps.${step.key}`)}
                    </span>
                  </div>
                  {i < OUTPUT_STEPS.length - 1 && (
                    <ChevronRight
                      size={18}
                      className="mx-1.5 shrink-0 text-slate-300 sm:mx-3"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Container>

        <Container className="mt-10 max-w-3xl">
          <div className="space-y-4 text-[15px] leading-[1.9] text-slate-600">
            {philosophyClosingParagraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Container>
      </section>

      {/* parent FAQ */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow={t("parent_faq.eyebrow")}
            title={t("parent_faq.title")}
            align="left"
          />
          <div className="mt-8">
            <FaqAccordion items={parentFaqItems} />
          </div>
        </Container>
      </section>

      {/* feedback system - in progress */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border-2 border-dashed border-brand-200 bg-white p-7 sm:p-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-bold text-brand-700">
              <Clock size={13} /> {t("feedback_system.eta")}
            </span>
            <h2 className="mt-4 text-xl font-bold text-brand-950 sm:text-2xl">
              {t("feedback_system.title")}
            </h2>
            <p className="mt-4 text-[15px] leading-[1.9] text-slate-600">
              {t("feedback_system.intro")}
            </p>
            <p className="mt-3 text-[15px] leading-[1.9] text-slate-600">
              {t("feedback_system.body")}
            </p>

            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {feedbackItems.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-[13.5px] text-slate-600"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-6 text-[15px] leading-[1.9] text-slate-600">
              {t("feedback_system.closing")}
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
