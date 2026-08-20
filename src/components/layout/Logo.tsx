import { useTranslation } from "react-i18next";
import { BrandMark } from "./BrandMark";
import { LocalizedLink } from "../i18n/LocalizedLink";

export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("common");

  return (
    <LocalizedLink
      to="/"
      className="group flex items-center gap-2.5"
      aria-label={t("aria.home_logo")}
    >
      <span className="transition-transform group-hover:scale-105">
        <BrandMark size={compact ? 32 : 38} />
      </span>
      <span className="flex flex-col leading-tight">
        <span
          className={`font-extrabold tracking-tight text-brand-950 ${
            compact ? "text-lg" : "text-xl sm:text-2xl"
          }`}
        >
          {t("footer.brand_name")}
        </span>
        {!compact && (
          <span className="text-[11px] font-medium tracking-wide text-slate-400">
            {t("footer.brand_tagline")}
          </span>
        )}
      </span>
    </LocalizedLink>
  );
}
