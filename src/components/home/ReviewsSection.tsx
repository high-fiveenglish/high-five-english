import { Star, Quote } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { REVIEWS } from "../../data/reviews";

export function ReviewsSection() {
  return (
    <section id="reviews" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="고객센터 · 수강후기"
          title="광고 대신, 후기로 증명합니다"
          description="하이파이브 잉글리쉬는 광고비 대신 실제 수업을 경험한 학부모님과 수강생들의 후기로 성장해 왔습니다."
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {REVIEWS.map((r) => (
            <div
              key={r.id}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(20,44,88,0.12)]"
            >
              <Quote size={22} className="text-brand-100" fill="currentColor" />
              <div className="mt-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={
                      i < r.rating
                        ? "fill-accent-400 text-accent-400"
                        : "fill-slate-200 text-slate-200"
                    }
                  />
                ))}
              </div>
              <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-slate-600">
                {r.content}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-slate-50 pt-4">
                <div>
                  <p className="text-sm font-bold text-brand-950">{r.author}</p>
                  <p className="text-xs text-slate-400">{r.role}</p>
                </div>
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                  {r.period}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
