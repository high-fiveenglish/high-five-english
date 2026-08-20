import { useTranslation } from "react-i18next";
import { Construction } from "lucide-react";
import { Container } from "../components/ui/Container";
import { LocalizedLink } from "../components/i18n/LocalizedLink";

export function PlaceholderPage({
  title,
  links,
}: {
  title: string;
  links?: { label: string; to: string }[];
}) {
  const { t } = useTranslation("common");
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <Construction size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        {t("errors.in_preparation_title")}
      </p>

      {links && links.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {links.map((l) => (
            <LocalizedLink
              key={l.to}
              to={l.to}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300"
            >
              {l.label}
            </LocalizedLink>
          ))}
        </div>
      )}

      <LocalizedLink
        to="/"
        className="mt-8 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        {t("errors.back_to_home")}
      </LocalizedLink>
    </Container>
  );
}
