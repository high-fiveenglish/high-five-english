import { useTranslation } from "react-i18next";
import { ArrowRight, Quote } from "lucide-react";
import { Container } from "../ui/Container";
import { LocalizedLink } from "../i18n/LocalizedLink";

const CEO_NAME = "우종범";

export function AboutTeaserSection() {
  const { t } = useTranslation("home");
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
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {CEO_NAME}
            </div>
            <div>
              <p className="text-sm font-bold text-brand-950">{t("aboutTeaser.ceo_display", { name: CEO_NAME })}</p>
              <p className="text-xs text-slate-400">{t("aboutTeaser.company_tagline")}</p>
            </div>
          </div>
        </div>

        <div>
          <span className="inline-block rounded-full bg-accent-50 px-3.5 py-1 text-xs font-semibold text-accent-600">
            {t("aboutTeaser.eyebrow")}
          </span>
          <h2 className="mt-4 text-2xl font-bold text-brand-950 sm:text-3xl">
            {t("aboutTeaser.heading")}
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-slate-500">
            {t("aboutTeaser.paragraph1")}
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-500">
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
