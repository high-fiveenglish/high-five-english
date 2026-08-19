import { useState } from "react";
import { Volume2 } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { INSTRUCTORS, type Instructor } from "../../data/instructors";
import { InstructorModal } from "./InstructorModal";

export function InstructorsSection() {
  const [selected, setSelected] = useState<Instructor | null>(null);

  return (
    <section id="instructors" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="강사소개"
          title="검증된 전문 강사진이 함께합니다"
          description="선발부터 교육, 정기 평가까지 — 하이파이브 잉글리쉬가 12년간 다듬어온 기준을 통과한 강사들입니다. 사진을 클릭하면 음성 소개와 상세 이력을 확인할 수 있어요."
        />

        <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {INSTRUCTORS.map((ins) => (
            <button
              key={ins.id}
              onClick={() => setSelected(ins)}
              className="group text-left"
            >
              <div
                className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-[0_10px_30px_rgba(20,44,88,0.12)] transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_38px_rgba(20,44,88,0.2)] ${ins.gradient}`}
              >
                <span className="text-5xl font-extrabold text-white/90">
                  {ins.name[0]}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-brand-700">
                  {ins.flag}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-brand-950/40 py-2.5 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  <Volume2 size={14} className="text-white" />
                  <span className="text-xs font-semibold text-white">
                    음성소개 듣기
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[15px] font-bold text-brand-950">
                {ins.name}{" "}
                <span className="text-xs font-medium text-slate-400">
                  {ins.nameEn}
                </span>
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {ins.tags.join(" · ")}
              </p>
            </button>
          ))}
        </div>
      </Container>

      <InstructorModal instructor={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
