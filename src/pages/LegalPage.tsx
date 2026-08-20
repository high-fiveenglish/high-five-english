import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/seo/SeoHead";

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

interface LegalDoc {
  meta_title: string;
  meta_description: string;
  title: string;
  translation_note?: string;
  intro?: string;
  toc?: string[];
  sections: LegalSection[];
  effective_note: string;
}

function LegalParagraph({ text }: { text: string }) {
  if (text.startsWith("▶")) {
    return <p className="mt-4 text-sm font-bold text-brand-950">{text}</p>;
  }
  if (text.startsWith("- ") || text.startsWith("* ")) {
    return (
      <p className="mt-1.5 pl-4 text-[13.5px] leading-relaxed text-slate-500">
        {"• " + text.slice(2)}
      </p>
    );
  }
  return <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-500">{text}</p>;
}

/** Renders either the Terms of Service or Privacy Policy from src/locales/{lang}/legal.json.
 * `doc` selects which top-level key of that namespace to render — the two pages share this
 * component since they're structurally identical (title/intro/sections/effective_note). */
export function LegalPage({ doc, path }: { doc: "terms" | "privacy"; path: string }) {
  const { t } = useTranslation("legal");
  const data = t(doc, { returnObjects: true }) as LegalDoc;

  if (!data || typeof data !== "object" || !Array.isArray(data.sections)) {
    return null;
  }

  return (
    <Container className="max-w-3xl py-14 sm:py-20">
      <SeoHead titleKey={`${doc}.meta_title`} descriptionKey={`${doc}.meta_description`} ns="legal" path={path} />

      <h1 className="text-2xl font-extrabold text-brand-950 sm:text-3xl">{data.title}</h1>

      {data.translation_note && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-700">
          {data.translation_note}
        </div>
      )}

      {data.intro && (
        <p className="mt-6 text-[13.5px] leading-relaxed text-slate-500">{data.intro}</p>
      )}

      {data.toc && data.toc.length > 0 && (
        <ul className="mt-6 grid gap-1 rounded-xl bg-brand-50/60 p-5 text-[13px] text-slate-600 sm:grid-cols-2">
          {data.toc.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <div className="mt-8 space-y-8">
        {data.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-[15px] font-bold text-brand-950">{section.heading}</h2>
            {section.paragraphs.map((p, i) => (
              <LegalParagraph key={i} text={p} />
            ))}
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-slate-100 pt-6 text-[12px] text-slate-400">
        {data.effective_note}
      </p>
    </Container>
  );
}
