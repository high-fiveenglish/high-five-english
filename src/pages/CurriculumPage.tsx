import { BookOpen, Sparkles } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { TextbookCatalog } from "../components/curriculum/TextbookCatalog";
import { TEXTBOOK_CATALOG, CATALOG_CATEGORIES } from "../data/textbookCatalog";
import {
  CURRICULUM_STAGES,
  NATIVE_READING_TRACK,
  SPECIALTY_PROGRAMS,
} from "../data/curriculum";

export function CurriculumPage({
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
            커리큘럼
          </span>
          <h1 className="mt-4 text-[1.9rem] font-extrabold leading-[1.3] text-brand-950 sm:text-4xl">
            실용영어부터 고급영어까지, 끊기지 않는 단계
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-slate-500 sm:text-base">
            하이파이브 잉글리쉬가 12년간 모아온 200여 종의 교재를 연령과
            레벨, 목적에 따라 다시 정리했습니다. 학생의 현재 실력과 목표에
            맞는 단계에서 시작해, 다음 단계로 자연스럽게 이어집니다.
          </p>
        </Container>
      </section>

      {/* stage roadmap */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow="레벨 로드맵"
            title="연령·레벨별 학습 단계"
            align="left"
          />

          <div className="relative mt-10 space-y-6">
            <div className="absolute bottom-6 left-6 top-6 hidden w-px bg-brand-100 sm:block" />
            {CURRICULUM_STAGES.map((s) => (
              <div key={s.id} className="relative sm:pl-16">
                <div className="absolute left-0 top-0 hidden h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-base font-extrabold text-white sm:flex">
                  {s.stage}
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-extrabold text-white sm:hidden">
                      {s.stage}
                    </span>
                    <h3 className="text-lg font-bold text-brand-950">{s.name}</h3>
                    <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-bold text-accent-600">
                      {s.ageRange}
                    </span>
                  </div>

                  <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600">
                    {s.goal}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {s.focus.map((f) => (
                      <span
                        key={f}
                        className="rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-600"
                      >
                        #{f}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-start gap-2 border-t border-slate-50 pt-4">
                    <BookOpen size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <p className="text-[13px] leading-relaxed text-slate-500">
                      <span className="font-semibold text-slate-600">대표 교재</span>
                      {"  "}
                      {s.books.join(" · ")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* full textbook catalog */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow="전체 교재 카탈로그"
            title="회화·문법·원서 교재 전체 목록"
            description={`Conversation·Grammar·Reading books 세 폴더의 교재 ${TEXTBOOK_CATALOG.length}종을 폴더·카테고리(${CATALOG_CATEGORIES.length}개)·레벨·연령대 기준으로 검색하고 필터링할 수 있습니다.`}
            align="left"
          />

          <div className="mt-8">
            <TextbookCatalog />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            원서·챕터북 카테고리의 레벨은 AR(파일명 표기값) 또는 널리 알려진
            Lexile 근사치를 CEFR로 환산한 값으로, 정밀한 배치용이 아니라
            참고용입니다.
          </p>
        </Container>
      </section>

      {/* native reading track */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border border-brand-100 bg-brand-50/40 p-7 sm:p-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1.5 text-xs font-bold text-accent-600">
              <Sparkles size={13} /> 심화 트랙
            </span>
            <h2 className="mt-3 text-xl font-bold text-brand-950 sm:text-2xl">
              {NATIVE_READING_TRACK.title}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              {NATIVE_READING_TRACK.desc}
            </p>

            <ul className="mt-5 space-y-2.5">
              {NATIVE_READING_TRACK.books.map((b) => (
                <li
                  key={b.title}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-[13.5px] font-medium text-slate-700">
                    {b.title}
                  </span>
                  <span className="rounded-full bg-brand-600/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">
                    {b.level}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* specialty programs */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow="목적별 특화 프로그램"
            title="일반 회화 외에 필요한 것들"
            align="left"
          />

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {SPECIALTY_PROGRAMS.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]"
              >
                <h3 className="text-[15px] font-bold text-brand-950">{p.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
                  {p.desc}
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
                  {p.books.join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* closing note + CTA */}
      <section className="bg-brand-950 py-16 text-center sm:py-20">
        <Container className="max-w-2xl">
          <h2 className="text-xl font-extrabold text-white sm:text-2xl">
            이 교재 목록은 계속 늘어납니다
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
            더 나은 자료가 있다면 계속 검토하고 추가합니다. 정확한 시작
            레벨은 무료 레벨테스트를 통해 확인해 드립니다.
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
