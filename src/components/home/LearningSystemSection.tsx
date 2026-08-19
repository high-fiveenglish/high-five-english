import { DoorOpen, FileCheck2, TrendingUp, ArrowRight } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";

const ITEMS = [
  {
    icon: DoorOpen,
    title: "내 강의실",
    desc: "수업 예약, 변경, 화상 수업 입장까지 한 곳에서 관리합니다. 지난 수업 다시보기와 교재 자료도 바로 확인할 수 있어요.",
  },
  {
    icon: FileCheck2,
    title: "학습평가서",
    desc: "형식적인 총평이 아닌, 오늘 배운 표현 · 발화 참여도 · 교정이 필요한 부분까지 수업마다 구체적으로 기록해 드립니다.",
  },
  {
    icon: TrendingUp,
    title: "매월 레벨평가",
    desc: "매월 누적된 학습 데이터를 바탕으로 레벨 변화를 리포트로 확인하고, 다음 학습 목표를 함께 설정합니다.",
  },
];

export function LearningSystemSection() {
  return (
    <section
      id="learning-system"
      className="scroll-mt-28 bg-brand-950 py-20 text-white sm:py-24"
    >
      <Container>
        <SectionHeading
          eyebrow="학습시스템"
          title="수업은 끝나도, 관리는 계속됩니다"
          description="학부모님이 수업을 직접 지켜보지 않아도 우리 아이가 무엇을 배우고 무엇을 개선해야 하는지 명확히 확인할 수 있는 학습 관리 시스템을 제공합니다."
          light
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {ITEMS.map((item) => (
            <div
              key={item.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400">
                <item.icon size={22} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-white/60">
                {item.desc}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-white/40 transition group-hover:text-accent-300">
                자세히 보기 <ArrowRight size={13} />
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
