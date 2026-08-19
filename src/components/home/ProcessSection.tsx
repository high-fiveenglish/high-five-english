import { PhoneCall, ClipboardList, UserCheck, PlayCircle } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";

const STEPS = [
  {
    icon: PhoneCall,
    title: "상담 신청",
    desc: "홈페이지 또는 카카오톡 채널로 간단한 정보를 남겨주세요.",
  },
  {
    icon: ClipboardList,
    title: "무료 레벨테스트",
    desc: "전문 강사와 1:1로 현재 실력을 정확히 진단합니다.",
  },
  {
    icon: UserCheck,
    title: "맞춤 강사 매칭",
    desc: "목표와 성향에 맞는 전담 강사를 배정해 드립니다.",
  },
  {
    icon: PlayCircle,
    title: "정규 수업 시작",
    desc: "원하는 시간에 예약하고 화상 수업을 시작합니다.",
  },
];

export function ProcessSection({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  return (
    <section id="process" className="scroll-mt-28 bg-brand-50/60 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="수강안내 · 수강절차"
          title="무료 레벨테스트부터 수업 시작까지"
          description="복잡한 절차 없이 4단계로 나만의 맞춤 화상영어 수업을 시작할 수 있습니다."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="relative">
              <div className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
                <span className="absolute -top-3.5 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="mt-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <step.icon size={22} />
                </div>
                <h3 className="mt-4 text-base font-bold text-brand-950">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                  {step.desc}
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
            지금 무료 레벨테스트 신청하기
          </button>
        </div>
      </Container>
    </section>
  );
}
