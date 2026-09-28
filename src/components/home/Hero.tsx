import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star, ShieldCheck, Users2, Video, MessageCircle, GraduationCap, Tag, ChevronRight } from "lucide-react";
import { Container } from "../ui/Container";
import { LocalizedLink } from "../i18n/LocalizedLink";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { ImageLightbox } from "./ImageLightbox";
import { ContactModal } from "../modals/ContactModal";

// 통계 아래 남는 빈 공간을 채우는 카드 3개 — 전부 기존 기능/페이지로만 연결한다(새
// 모달·새 페이지 없음). 상담은 기존 ContactModal(실제 카카오톡/위챗 아이디는
// ConsultChannelList가 그대로 조회), 강사·가격표는 기존 nav와 동일한 홈 내부 스크롤
// 이동(LocalizedLink + scrollTo state, ScrollToHash가 처리)을 그대로 재사용한다.
const HERO_CARD_CLASS =
  "flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(20,44,88,0.06)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_12px_28px_rgba(20,44,88,0.1)]";

export function Hero({ onOpenLevelTest }: { onOpenLevelTest: () => void }) {
  const { t } = useTranslation("home");
  const [contactOpen, setContactOpen] = useState(false);

  const feedbackRows = [
    { label: t("hero.demo.row1_label"), value: t("hero.demo.row1_value") },
    { label: t("hero.demo.row2_label"), value: t("hero.demo.row2_value") },
    { label: t("hero.demo.row3_label"), value: t("hero.demo.row3_value") },
    { label: t("hero.demo.row4_label"), value: t("hero.demo.row4_value") },
  ];

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-100 opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 top-40 h-72 w-72 rounded-full bg-brand-100 opacity-70 blur-3xl" />

      <Container className="relative grid items-start gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            <ShieldCheck size={14} /> {t("hero.badge")}
          </span>

          <h1 className="mt-5 text-[2rem] font-extrabold leading-[1.25] text-brand-950 sm:text-[2.5rem] lg:text-[2.75rem]">
            {t("hero.headline.line1")}
            <br />
            <span className="text-brand-600">{t("hero.headline.emphasis1")}</span>{" "}
            {t("hero.headline.line2_rest")}
            <br />
            1:1 <span className="text-accent-500">{t("hero.headline.emphasis2")}</span>
          </h1>

          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {t("hero.subtext")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onOpenLevelTest}
              className="rounded-xl bg-accent-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.3)] transition hover:-translate-y-0.5 hover:bg-accent-600"
            >
              {t("hero.cta_primary")}
            </button>
            <LocalizedLink
              to="/process"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-brand-950 transition hover:-translate-y-0.5 hover:border-brand-300"
            >
              {t("hero.cta_secondary")}
            </LocalizedLink>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-slate-100 pt-6 text-center sm:text-left">
            <div>
              <dt className="text-[11px] font-medium text-slate-400">{t("hero.stats.experience_label")}</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">{t("hero.stats.experience_value")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">{t("hero.stats.teacher_label")}</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">{t("hero.stats.teacher_value")}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-400">{t("hero.stats.growth_label")}</dt>
              <dd className="mt-1 text-xl font-extrabold text-brand-950">{t("hero.stats.growth_value")}</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-col gap-3">
            <button type="button" onClick={() => setContactOpen(true)} className={`${HERO_CARD_CLASS} text-left`}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FEE500]/60 text-[#3C1E1E]">
                <MessageCircle size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-brand-950">수업 전에 궁금한 점이 있으신가요?</p>
                <p className="mt-0.5 text-xs text-slate-500">카카오톡·위챗 아이디로 편하게 1:1 무료 상담해 드립니다.</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-300" />
            </button>

            <LocalizedLink to="/" state={{ scrollTo: "instructors" }} className={HERO_CARD_CLASS}>
              <GraduationCap size={18} className="shrink-0 text-brand-600" />
              <div className="flex-1">
                <p className="text-sm font-bold text-brand-950">검증된 원어민·외국인 강사진</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  선발·정기 교육·평가를 거친 강사만 배정합니다. 강사 소개 보러가기
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-300" />
            </LocalizedLink>

            <LocalizedLink to="/" state={{ scrollTo: "pricing" }} className={HERO_CARD_CLASS}>
              <Tag size={18} className="shrink-0 text-brand-600" />
              <div className="flex-1">
                <p className="text-sm font-bold text-brand-950">합리적인 가격, 타협 없는 수업 품질</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">수업 기간·횟수별 가격표 보러가기</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-300" />
            </LocalizedLink>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-md flex-col gap-5">
          {/* 실제 1:1 화상수업 영상 자리 — 관리자 업로드 기능이 붙기 전까지 Placeholder
              상태로 유지, 클릭하면 크게 볼 수 있음 */}
          <ImageLightbox label="실제 1:1 수업 화면">
            <ImagePlaceholder
              label="실제 1:1 수업 화면"
              aspect="4/3"
              icon={Video}
              tone="brand"
              className="shadow-[0_24px_60px_rgba(20,44,88,0.14)]"
            />
          </ImageLightbox>

          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_24px_60px_rgba(20,44,88,0.14)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-brand-950">{t("hero.demo.title")}</p>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600">
                2026.08.19
              </span>
            </div>

            {/* 실제 평가서/Feedback 이미지 자리 — 관리자 업로드 기능이 붙기 전까지
                Placeholder 상태로 유지, 기존 상세 행은 그 아래 보조 설명으로 유지 */}
            <ImageLightbox label="실제 평가서 화면">
              <ImagePlaceholder label="실제 평가서 화면" aspect="16/9" tone="accent" className="mt-4" />
            </ImageLightbox>

            <div className="mt-4 space-y-3">
              {feedbackRows.map((row) => (
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
                {t("hero.demo.comment")}
              </span>
            </div>
          </div>

          <div className="absolute -bottom-5 -left-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-[0_14px_34px_rgba(20,44,88,0.16)]">
            <Users2 size={18} className="text-brand-600" />
            <span className="text-xs font-bold text-brand-950">
              {t("hero.demo.badge")}
            </span>
          </div>
        </div>
      </Container>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </section>
  );
}
