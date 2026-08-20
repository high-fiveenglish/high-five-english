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
import { FaqAccordion } from "../components/ui/FaqAccordion";
import {
  CEO_LETTER_PARAGRAPHS,
  CEO_LETTER_PULL_QUOTE,
  CEO_LETTER_PARAGRAPHS_2,
  CEO_LETTER_QUESTIONS,
  CEO_LETTER_PARAGRAPHS_3,
  TRUST_SECTION,
  PHILOSOPHY_SECTION,
  OUTPUT_STEPS,
  PARENT_FAQ,
  FEEDBACK_SYSTEM,
} from "../data/aboutContent";

const STEP_ICONS = {
  Ear,
  Lightbulb,
  Brain,
  MessageCircle,
  PenLine,
  RotateCw,
} as const;

export function AboutPage() {
  return (
    <>
      {/* page header */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white py-14 sm:py-16">
        <Container className="text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            회사소개
          </span>
          <h1 className="mt-4 text-[1.75rem] font-extrabold leading-tight text-brand-950 sm:text-3xl">
            하이파이브 잉글리쉬 이야기
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
            대표 우종범이 12년간 화상영어를 운영하며 고민해온 것들과, 하이파이브
            잉글리쉬가 지금 만들어가고 있는 것들을 그대로 전해드립니다.
          </p>
        </Container>
      </section>

      {/* CEO letter */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white">
              우종범
            </div>
            <div>
              <p className="text-sm font-bold text-brand-950">
                우종범 대표가 전하는 이야기
              </p>
              <p className="text-xs text-slate-400">
                하이파이브 잉글리쉬 · 화상영어 교육 12년차
              </p>
            </div>
          </div>

          <div className="space-y-5 text-[15.5px] leading-[1.9] text-slate-600">
            {CEO_LETTER_PARAGRAPHS.map((p) => (
              <p key={p}>{p}</p>
            ))}

            <blockquote className="rounded-2xl border-l-4 border-accent-400 bg-accent-50/60 px-5 py-4 text-[15.5px] font-bold leading-relaxed text-brand-950">
              {CEO_LETTER_PULL_QUOTE}
            </blockquote>

            {CEO_LETTER_PARAGRAPHS_2.map((p) => (
              <p key={p}>{p}</p>
            ))}

            <ul className="space-y-2.5 rounded-2xl bg-brand-50/60 p-5">
              {CEO_LETTER_QUESTIONS.map((q) => (
                <li key={q} className="flex items-start gap-2.5 text-[14.5px] text-brand-900">
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-brand-500" />
                  {q}
                </li>
              ))}
            </ul>

            {CEO_LETTER_PARAGRAPHS_3.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>

          <div className="mt-8 text-right text-sm text-slate-400">
            하이파이브 잉글리쉬 대표
            <br />
            <span className="text-base font-bold text-brand-950">우종범</span>
          </div>
        </Container>
      </section>

      {/* trust */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <Quote size={26} className="text-brand-300" fill="currentColor" />
          <h2 className="mt-4 text-xl font-bold text-brand-950 sm:text-2xl">
            {TRUST_SECTION.title}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.9] text-slate-600">
            {TRUST_SECTION.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Container>
      </section>

      {/* philosophy + output flow */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <h2 className="text-xl font-bold text-brand-950 sm:text-2xl">
            {PHILOSOPHY_SECTION.title}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-[1.9] text-slate-600">
            {PHILOSOPHY_SECTION.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Container>

        <Container className="mt-10">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-1 gap-y-6">
            {OUTPUT_STEPS.map((step, i) => {
              const Icon = STEP_ICONS[step.icon];
              return (
                <div key={step.label} className="flex items-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600">
                      <Icon size={24} />
                    </div>
                    <span className="text-xs font-bold text-brand-950">
                      {step.label}
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
            {PHILOSOPHY_SECTION.closingParagraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Container>
      </section>

      {/* parent FAQ */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow="학부모님이 궁금해하시는 것들"
            title="옆에서 지켜보지 않아도 궁금한 것들"
            align="left"
          />
          <div className="mt-8">
            <FaqAccordion items={PARENT_FAQ} />
          </div>
        </Container>
      </section>

      {/* feedback system - in progress */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border-2 border-dashed border-brand-200 bg-white p-7 sm:p-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-bold text-brand-700">
              <Clock size={13} /> {FEEDBACK_SYSTEM.eta}
            </span>
            <h2 className="mt-4 text-xl font-bold text-brand-950 sm:text-2xl">
              {FEEDBACK_SYSTEM.title}
            </h2>
            <p className="mt-4 text-[15px] leading-[1.9] text-slate-600">
              {FEEDBACK_SYSTEM.intro}
            </p>
            <p className="mt-3 text-[15px] leading-[1.9] text-slate-600">
              {FEEDBACK_SYSTEM.body}
            </p>

            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {FEEDBACK_SYSTEM.items.map((item) => (
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
              {FEEDBACK_SYSTEM.closing}
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
