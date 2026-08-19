import { Mic2, ScrollText, HeartHandshake, LineChart, Layers, BadgeDollarSign } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";

const REASONS = [
  {
    icon: Mic2,
    title: "듣기·말하기 중심 Output 수업",
    desc: "정해진 진도만 나가지 않고, 반복훈련과 질문·답변, 자유로운 의사소통으로 배운 영어를 즉시 사용하게 합니다.",
  },
  {
    icon: ScrollText,
    title: "12년 경력, 한 길을 걸어온 전문성",
    desc: "대표가 직접 12년째 화상영어 교육사업을 운영하며 강사 선발, 교육, 관리 전 과정을 지속적으로 개선해 왔습니다.",
  },
  {
    icon: HeartHandshake,
    title: "광고가 아닌 신뢰로 성장",
    desc: "대규모 광고 대신 실제 수업을 경험한 학부모님과 수강생의 소개로 성장해 온, 검증된 교육 서비스입니다.",
  },
  {
    icon: LineChart,
    title: "구체적이고 투명한 Feedback",
    desc: "'오늘 수업 잘했습니다' 식의 형식적 평가가 아닌, 무엇을 배우고 무엇을 개선해야 하는지 구체적으로 안내합니다.",
  },
  {
    icon: Layers,
    title: "실용영어부터 고급영어까지 단계적 설계",
    desc: "충분한 Output과 체계적인 교정을 기반으로 실용영어를 완성하고, 이를 발판 삼아 고급영어까지 확장합니다.",
  },
  {
    icon: BadgeDollarSign,
    title: "합리적인 가격, 타협 없는 수업 품질",
    desc: "저렴함만을 목표로 하지 않습니다. 합리적인 비용과 높은 수업 품질을 동시에 실현하는 것이 저희의 방향입니다.",
  },
];

export function WhyUsSection() {
  return (
    <section className="bg-brand-50/60 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="WHY HIFIVE"
          title="왜 하이파이브 잉글리쉬여야 할까요?"
          description="12년간 수많은 학습자와 학부모님을 만나며 다듬어온 원칙이 하이파이브 잉글리쉬의 수업 하나하나에 담겨 있습니다."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {REASONS.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(20,44,88,0.12)]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
                <r.icon size={20} />
              </div>
              <h3 className="mt-4 text-[15px] font-bold text-brand-950">
                {r.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                {r.desc}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
