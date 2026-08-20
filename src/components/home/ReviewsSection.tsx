import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star, Quote, User } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { REVIEWS } from "../../data/reviews";
import { listPublishedReviews } from "../../services/reviewService";
import type { StudentReview } from "../../lib/community/types";

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

export function ReviewsSection() {
  const { t } = useTranslation("home");
  const { t: tReviews } = useTranslation("reviews");
  const [liveReviews, setLiveReviews] = useState<StudentReview[]>([]);

  useEffect(() => {
    listPublishedReviews().then(setLiveReviews);
  }, []);

  return (
    <section id="reviews" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("reviews.eyebrow")}
          title={t("reviews.title")}
          description={t("reviews.description")}
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
                {t(`reviews.items.${r.id}.content`)}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-slate-50 pt-4">
                <div>
                  <p className="text-sm font-bold text-brand-950">
                    {t(`reviews.items.${r.id}.author`)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t(`reviews.items.${r.id}.role`)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                  {t(`reviews.items.${r.id}.period`)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {liveReviews.length > 0 && (
          <div className="mt-14">
            <h3 className="text-center text-lg font-bold text-brand-950">
              {tReviews("live_section_title")}
            </h3>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {liveReviews.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col rounded-2xl border border-slate-100 bg-brand-50/30 p-6"
                >
                  <p className="flex-1 text-[13.5px] leading-relaxed text-slate-600">{r.content}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                        <User size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-brand-950">{r.studentEnglishName}</p>
                        <p className="text-xs text-slate-400">
                          {tReviews("taught_by", { teacher: r.teacherName })}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Container>
    </section>
  );
}
