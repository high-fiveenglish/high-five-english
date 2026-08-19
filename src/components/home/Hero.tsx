import { Star, ShieldCheck, Users2 } from "lucide-react";
import { Container } from "../ui/Container";

export function Hero({ onOpenLevelTest }: { onOpenLevelTest: () => void }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-100 opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-40 h-72 w-72 rounded-full bg-brand-100 opacity-70 blur-3xl" />

      <Container className="relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            <ShieldCheck size={14} /> 12년째 화상영어 한 길, 하이파이브 잉글리쉬
          </span>

          <h1 className="mt-5 text-[2rem] font-extrabold leading-[1.25] text-brand-950 sm:text-[2.5rem] lg:text-[2.75rem]">
            듣기만 하는 영어는 그만,
            <br />
            <span className="text-brand-600">직접 말하며</span> 완성하는
            <br />
            1:1 <span className="text-accent-500">화상영어</span>
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-500 sm:text-base">
            원어민 및 전문 외국인 강사와의 인터랙티브 수업으로 배운 영어를
            즉시 사용하고, 반복훈련과 구체적인 Feedback으로 실제 의사소통
            능력까지 완성합니다.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onOpenLevelTest}
              className="rounded-xl bg-accent-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
            >
              무료 레벨테스트 신청
            </button>
            <a
              href="#process"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-brand-950 transition hover:-translate-y-0.5 hover:border-brand-300"
            >
              수강절차 살펴보기
            </a>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-slate-100 pt-6 text-center sm:text-left">
            <div>
              <dt className="text-[11px] font-medium text-slate-400">운영 경력</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">12년</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">전담 강사</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">1:1 매칭</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">성장 방식</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">입소문 성장</dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_24px_60px_rgba(20,44,88,0.14)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-brand-950">오늘의 학습 Feedback</p>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600">
                2026.08.19
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: "오늘 배운 표현", value: "5개 문장 학습 완료" },
                { label: "발화 참여도", value: "적극적 · 상" },
                { label: "교정이 필요한 부분", value: "과거시제 동사 활용" },
                { label: "다음 수업 목표", value: "자유 발화 비중 늘리기" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-xs text-slate-400">{row.label}</span>
                  <span className="text-xs font-semibold text-brand-900">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-1 rounded-xl bg-accent-50 px-4 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14} className="fill-accent-400 text-accent-400" />
              ))}
              <span className="ml-2 text-xs font-semibold text-accent-600">
                강사 코멘트: "오늘 자유발화에서 크게 성장했어요!"
              </span>
            </div>
          </div>

          <div className="absolute -bottom-5 -left-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_14px_34px_rgba(20,44,88,0.16)]">
            <Users2 size={18} className="text-brand-600" />
            <span className="text-xs font-bold text-brand-950">
              전문 원어민 · 외국인 강사진
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
