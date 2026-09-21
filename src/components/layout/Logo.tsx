import { useTranslation } from "react-i18next";
import { BrandMark } from "./BrandMark";
import { LocalizedLink } from "../i18n/LocalizedLink";
import { useTenant } from "../../context/TenantContext";

export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation("common");
  const tenant = useTenant();
  const brandName = tenant.isHeadquarters ? t("footer.brand_name") : tenant.name;
  const brandTagline = tenant.isHeadquarters ? t("footer.brand_tagline") : tenant.brandTagline;

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
          {brandName}
        </span>
        {!compact && brandTagline && (
          <span className="text-[11px] font-medium tracking-wide text-slate-400">
            {brandTagline}
          </span>
        )}
      </span>
    </LocalizedLink>
  );
}
