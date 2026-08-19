import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { PRICING_DURATIONS, formatWon } from "../../data/pricing";

export function PricingSection({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  const [activeId, setActiveId] = useState(PRICING_DURATIONS[1].id);
  const active =
    PRICING_DURATIONS.find((d) => d.id === activeId) ?? PRICING_DURATIONS[0];

  return (
    <section id="pricing" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="수강안내 · 수강료"
          title="화상영어 가격표"
          description="1:1 전담 강사 배정을 기본으로 하며, 학습평가서와 레벨평가는 모든 반에 공통 제공됩니다. 수강 기간이 길수록 회당 수강료가 저렴해집니다."
        />

        {/* duration tabs */}
        <div className="mx-auto mt-10 flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-slate-100 p-1.5">
          {PRICING_DURATIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`relative flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                activeId === d.id
                  ? "bg-white text-brand-700 shadow-[0_4px_14px_rgba(20,44,88,0.12)]"
                  : "text-slate-500 hover:text-brand-600"
              }`}
            >
              {d.label}
              {d.badge && (
                <span
                  className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    activeId === d.id
                      ? "bg-accent-500 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {d.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* price tables: 25min / 50min */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {(
            [
              { key: "price25" as const, title: "25분 수업" },
              { key: "price50" as const, title: "50분 수업" },
            ]
          ).map((col) => (
            <div
              key={col.key}
              className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(20,44,88,0.06)]"
            >
              <div className="flex items-center justify-between bg-brand-950 px-6 py-4">
                <h3 className="text-sm font-bold text-white">{col.title}</h3>
                <span className="text-xs font-medium text-white/50">
                  {active.label} 기준
                </span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-accent-50">
                    <th className="px-6 py-3 text-left text-xs font-bold text-accent-700">
                      수업 구분
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-accent-700">
                      수강료
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((row, i) => (
                    <tr
                      key={row.frequency}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50/70"}
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-600">
                        {row.frequency}
                      </td>
                      <td className="px-6 py-4 text-right text-base font-extrabold text-brand-950">
                        {formatWon(col.key === "price25" ? row.price25 : row.price50)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            onClick={onOpenLevelTest}
            className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            <Sparkles size={16} /> 무료 레벨테스트로 시작하기
          </button>
          <p className="text-center text-xs text-slate-400">
            * 상기 수강료는 1:1 개인 수업 기준이며, 프로모션 및 형제 할인 등은
            1:1 상담을 통해 안내드립니다.
          </p>
        </div>
      </Container>
    </section>
  );
}
