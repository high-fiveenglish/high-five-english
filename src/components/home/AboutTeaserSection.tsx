import { Link } from "react-router-dom";
import { ArrowRight, Quote } from "lucide-react";
import { Container } from "../ui/Container";

export function AboutTeaserSection() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <Container className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-slate-100 bg-brand-50/60 p-8">
          <Quote size={26} className="text-brand-300" fill="currentColor" />
          <p className="mt-4 text-lg font-bold leading-snug text-brand-950">
            "광고가 아니라 교육의 결과와 고객의 신뢰로 성장한다."
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            하이파이브 잉글리쉬가 12년간 지켜온 가장 중요한 원칙입니다.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              우종범
            </div>
            <div>
              <p className="text-sm font-bold text-brand-950">우종범 대표</p>
              <p className="text-xs text-slate-400">하이파이브 잉글리쉬 · 화상영어 교육 12년차</p>
            </div>
          </div>
        </div>

        <div>
          <span className="inline-block rounded-full bg-accent-50 px-3.5 py-1 text-xs font-semibold text-accent-600">
            회사소개
          </span>
          <h2 className="mt-4 text-2xl font-bold text-brand-950 sm:text-3xl">
            EFL 환경에 최적화된, 실제로 통하는 영어교육
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-500">
            영어를 잘하기 위해서는 단순히 많이 듣고 읽는 것만으로는 충분하지
            않습니다. 하이파이브 잉글리쉬는 원어민 및 전문 외국인 강사와의
            인터랙티브한 화상영어 수업을 통해 학습자가 배운 영어를 수업 중
            즉시 활용하고, 그 과정에서 자연스럽게 듣기와 말하기 능력을
            향상시킬 수 있도록 프로그램을 운영하고 있습니다.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
            정해진 교재를 진도에 맞춰 끝내는 수업이 아니라, 학습자의 수준과
            목표에 맞는 반복훈련, 질문과 답변, 자유로운 의사소통, 문장 교정
            및 다양한 Feedback을 통해 실제로 사용할 수 있는 영어를 만드는
            것을 가장 중요하게 생각합니다.
          </p>
          <Link
            to="/about"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 transition hover:gap-2.5"
          >
            하이파이브 잉글리쉬 이야기 더 보기 <ArrowRight size={16} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
