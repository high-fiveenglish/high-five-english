import { useTranslation } from "react-i18next";
import { ArrowRight, Quote } from "lucide-react";
import { Container } from "../ui/Container";
import { LocalizedLink } from "../i18n/LocalizedLink";
import { useTenant } from "../../context/TenantContext";
import { ImageLightbox } from "./ImageLightbox";
import leveltestResultScreenshot from "../../assets/homepage/leveltest-result.png";
import leveltestResultFullScreenshot from "../../assets/homepage/leveltest-result-full.png";

export function AboutTeaserSection() {
  const { t } = useTranslation("home");
  const tenant = useTenant();
  // /about 페이지와 동일하게, 서사(문구·연혁)는 그대로 두고 대표 이름만 협력사
  // 대표로 바꿔 보여준다.
  const ceoName = tenant.biz.ceo ?? "우종범";
  return (
    <section className="bg-white py-20 sm:py-24">
      <Container className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-slate-100 bg-brand-50/60 p-8">
          <Quote size={26} className="text-brand-300" fill="currentColor" />
          <p className="mt-4 text-lg font-bold leading-snug text-brand-950">
            {t("aboutTeaser.quote")}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            {t("aboutTeaser.quote_sub")}
          </p>

          {/* 방문자가 실제로 받게 될 레벨테스트 결과 리포트를 바로 확인할 수 있도록
              예시 화면을 보여준다. 클릭하면 전체(Teacher Feedback 포함)를 팝업으로 본다. */}
          <div className="mt-6">
            <ImageLightbox label={t("aboutTeaser.leveltest_preview_label")} fullSrc={leveltestResultFullScreenshot}>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <p className="border-b border-slate-100 bg-white px-4 py-2 text-[11px] font-bold text-brand-600">
                  {t("aboutTeaser.leveltest_preview_caption")}
                </p>
                <img
                  src={leveltestResultScreenshot}
                  alt={t("aboutTeaser.leveltest_preview_label")}
                  className="max-h-72 w-full object-cover object-top"
                />
              </div>
            </ImageLightbox>
          </div>

          <div className="mt-4">
            <p className="text-sm font-bold text-brand-950">{t("aboutTeaser.ceo_display", { name: ceoName })}</p>
            <p className="text-xs text-slate-400">{t("aboutTeaser.company_tagline")}</p>
          </div>
        </div>

        <div>
          <span className="inline-block rounded-full bg-accent-50 px-3.5 py-1 text-xs font-semibold text-accent-600">
            {t("aboutTeaser.eyebrow")}
          </span>
          <h2 className="mt-4 text-2xl font-bold leading-tight text-brand-950 sm:text-3xl md:mt-5 md:text-[2.25rem]">
            {t("aboutTeaser.heading")}
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {t("aboutTeaser.paragraph1")}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {t("aboutTeaser.paragraph2")}
          </p>
          <LocalizedLink
            to="/about"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 transition hover:gap-2.5"
          >
            {t("aboutTeaser.more_link")} <ArrowRight size={16} />
          </LocalizedLink>
        </div>
      </Container>
    </section>
  );
}
