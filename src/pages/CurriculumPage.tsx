import { BookOpen, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { TextbookCatalog } from "../components/curriculum/TextbookCatalog";
import { SeoHead } from "../components/seo/SeoHead";
import { TEXTBOOK_CATALOG, CATALOG_CATEGORIES } from "../data/textbookCatalog";
import {
  CURRICULUM_STAGES,
  NATIVE_READING_TRACK_BOOKS,
  SPECIALTY_PROGRAMS,
} from "../data/curriculum";

const NATIVE_TRACK_LEVEL_KEYS = new Set(["advanced", "advancedPlus"]);

export function CurriculumPage({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  const { t } = useTranslation("curriculum");

  return (
    <>
      <SeoHead titleKey="meta.title" descriptionKey="meta.description" ns="curriculum" path="/curriculum" />
      {/* hero */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-white pt-16 pb-6 sm:pt-20 sm:pb-8">
        <Container className="max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            {t("hero.eyebrow")}
          </span>
          <h1 className="mt-4 text-[1.9rem] font-extrabold leading-[1.3] text-brand-950 sm:text-4xl">
            {t("hero.heading")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-slate-500 sm:text-base">
            {t("hero.paragraph")}
          </p>
        </Container>
      </section>

      {/* stage roadmap */}
      <section className="pt-8 pb-16 sm:pt-10 sm:pb-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow={t("roadmap.eyebrow")}
            title={t("roadmap.title")}
            align="left"
          />

          <div className="relative mt-10 space-y-6">
            <div className="absolute bottom-6 left-6 top-6 hidden w-px bg-brand-100 sm:block" />
            {CURRICULUM_STAGES.map((s) => {
              const focus = t(`stages.${s.id}.focus`, { returnObjects: true }) as string[];
              return (
                <div key={s.id} className="relative sm:pl-16">
                  <div className="absolute left-0 top-0 hidden h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-base font-extrabold text-white sm:flex">
                    {s.stage}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-extrabold text-white sm:hidden">
                        {s.stage}
                      </span>
                      <h3 className="text-lg font-bold text-brand-950">
                        {t(`stages.${s.id}.name`)}
                      </h3>
                      <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-bold text-accent-600">
                        {t(`stages.${s.id}.ageRange`)}
                      </span>
                    </div>

                    <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600">
                      {t(`stages.${s.id}.goal`)}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {focus.map((f) => (
                        <span
                          key={f}
                          className="rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-600"
                        >
                          #{f}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-start gap-2 border-t border-slate-50 pt-4">
                      <BookOpen size={15} className="mt-0.5 shrink-0 text-slate-400" />
                      <p className="text-[13px] leading-relaxed text-slate-500">
                        <span className="font-semibold text-slate-600">
                          {t("representativeBooksLabel")}
                        </span>
                        {"  "}
                        {s.books.join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {/* full textbook catalog */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-5xl">
          <SectionHeading
            eyebrow={t("catalogSection.eyebrow")}
            title={t("catalogSection.title")}
            description={t("catalogSection.description", {
              count: TEXTBOOK_CATALOG.length,
              categoryCount: CATALOG_CATEGORIES.length,
            })}
            align="left"
          />

          <div className="mt-8">
            <TextbookCatalog />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            {t("catalogSection.disclaimer")}
          </p>
        </Container>
      </section>

      {/* native reading track */}
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl">
          <div className="rounded-3xl border border-brand-100 bg-brand-50/40 p-7 sm:p-9">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1.5 text-xs font-bold text-accent-600">
              <Sparkles size={13} /> {t("nativeReadingTrack.badge")}
            </span>
            <h2 className="mt-3 text-xl font-bold text-brand-950 sm:text-2xl">
              {t("nativeReadingTrack.title")}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              {t("nativeReadingTrack.desc")}
            </p>

            <ul className="mt-5 space-y-2.5">
              {NATIVE_READING_TRACK_BOOKS.map((b) => (
                <li
                  key={b.title}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-[13.5px] font-medium text-slate-700">
                    {b.title}
                  </span>
                  <span className="rounded-full bg-brand-600/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-700">
                    {NATIVE_TRACK_LEVEL_KEYS.has(b.level)
                      ? t(`nativeReadingTrack.levels.${b.level}`)
                      : b.level}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* specialty programs */}
      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow={t("specialty.eyebrow")}
            title={t("specialty.title")}
            align="left"
          />

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {SPECIALTY_PROGRAMS.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]"
              >
                <h3 className="text-[15px] font-bold text-brand-950">
                  {t(`specialty.programs.${p.id}.title`)}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
                  {t(`specialty.programs.${p.id}.desc`)}
                </p>
                <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
                  {p.books.join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* closing note + CTA */}
      <section className="bg-brand-950 py-16 text-center sm:py-20">
        <Container className="max-w-2xl">
          <h2 className="text-xl font-extrabold text-white sm:text-2xl">
            {t("closing.heading")}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-white/60">
            {t("closing.paragraph")}
          </p>
          <button
            onClick={onOpenLevelTest}
            className="mt-7 rounded-xl bg-accent-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(248,114,26,0.35)] transition hover:-translate-y-0.5 hover:bg-accent-600"
          >
            {t("closing.cta")}
          </button>
        </Container>
      </section>
    </>
  );
}
