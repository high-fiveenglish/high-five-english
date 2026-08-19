import { Clock, Sparkles } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { CompareBlock } from "../components/program/CompareBlock";
import {
  HERO,
  OUTPUT_SECTION,
  AI_SECTION,
  STRENGTHS_TITLE,
  STRENGTHS,
  FEEDBACK_STRENGTH,
  CLOSING_CTA,
} from "../data/programContent";

export function ProgramPage({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  return (
    <>
      {/* hero */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white py-16 sm:py-20">
        <Container className="max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            {HERO.eyebrow}
          </span>
          <h1 className="mt-4 text-[1.9rem] font-extrabold leading-[1.3] text-brand-950 sm:text-4xl">
            {HERO.headline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {HERO.sub}
          </p>
          <button
            onClick={onOpenLevelTest}
            className="mt-8 rounded-xl bg-accent-500 px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            무료 레벨테스트로 시작하기
          </button>
        </Container>
      </section>

      {/* output section */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <span className="text-xs font-bold text-accent-600">{OUTPUT_SECTION.eyebrow}</span>
          <h2 className="mt-2 text-xl font-extrabold text-brand-950 sm:text-2xl">
            {OUTPUT_SECTION.title}
          </h2>
          <p className="mt-4 text-[16px] font-bold leading-relaxed text-brand-900">
            {OUTPUT_SECTION.lead}
          </p>
          <p className="mt-3 text-[15px] leading-[1.9] text-slate-600">
            {OUTPUT_SECTION.body}
          </p>

          <CompareBlock
            left={OUTPUT_SECTION.compare.left}
            right={OUTPUT_SECTION.compare.right}
            highlight={OUTPUT_SECTION.highlight}
          />

          <p className="mt-6 text-[15px] leading-[1.9] text-slate-600">
            {OUTPUT_SECTION.closing}
          </p>
        </Container>
      </section>

      {/* AI differentiation section */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <span className="text-xs font-bold text-accent-600">{AI_SECTION.eyebrow}</span>
          <h2 className="mt-2 text-xl font-extrabold text-brand-950 sm:text-2xl">
            {AI_SECTION.title}
          </h2>
          <p className="mt-4 text-[16px] font-bold leading-relaxed text-brand-900">
            {AI_SECTION.lead}
          </p>
          <p className="mt-3 text-[15px] leading-[1.9] text-slate-600">{AI_SECTION.body}</p>
          <p className="mt-3 text-[15px] leading-[1.9] text-slate-600">{AI_SECTION.body2}</p>

          <CompareBlock
            left={AI_SECTION.compare.left}
            right={AI_SECTION.compare.right}
            highlight={AI_SECTION.highlight}
          />
        </Container>
      </section>

      {/* strengths */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading eyebrow="핵심 강점 3" title={STRENGTHS_TITLE} align="left" />

          <div className="mt-8 space-y-5">
            {STRENGTHS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-bold text-brand-700">
                  <Sparkles size={12} /> {s.badge}
                </span>
                <h3 className="mt-3 text-[17px] font-bold text-brand-950">{s.title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-600">{s.body}</p>
              </div>
            ))}

            <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-white p-6 sm:p-7">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-bold text-brand-700">
                <Clock size={12} /> {FEEDBACK_STRENGTH.badge}
              </span>
              <h3 className="mt-3 text-[17px] font-bold text-brand-950">
                {FEEDBACK_STRENGTH.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-600">
                {FEEDBACK_STRENGTH.body}
              </p>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {FEEDBACK_STRENGTH.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                    {item}
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-[14.5px] leading-relaxed text-slate-600">
                {FEEDBACK_STRENGTH.closing}
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* closing CTA */}
      <section className="bg-brand-950 py-16 text-center sm:py-20">
        <Container className="max-w-2xl">
          <h2 className="text-xl font-extrabold text-white sm:text-2xl">
            {CLOSING_CTA.title}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
            {CLOSING_CTA.body}
          </p>
          <button
            onClick={onOpenLevelTest}
            className="mt-7 rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.35)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            무료 레벨테스트 신청하기
          </button>
        </Container>
      </section>
    </>
  );
}
