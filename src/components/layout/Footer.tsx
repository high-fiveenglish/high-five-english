import { useTranslation } from "react-i18next";
import { MessageCircle, Clock, Landmark, Globe } from "lucide-react";
import { Container } from "../ui/Container";
import { CONTACT } from "../../data/contact";
import { BrandMark } from "./BrandMark";
import { LocalizedLink } from "../i18n/LocalizedLink";

export function Footer({ onOpenContact }: { onOpenContact: () => void }) {
  const { t } = useTranslation("common");

  return (
    <footer className="border-t border-white/10 bg-brand-950 text-white/70">
      <Container className="py-10">
        <LocalizedLink to="/" className="flex justify-center" aria-label={t("footer.brand_name")}>
          <BrandMark size={30} />
        </LocalizedLink>

        <div className="mt-8 grid gap-10 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-sm font-bold text-white">{t("footer.company_info")}</h4>
            <dl className="space-y-1.5 text-[13px] leading-relaxed text-white/55">
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.biz_name_label")}</dt>
                <dd>하이파이브 잉글리쉬</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.ceo_label")}</dt>
                <dd>우종범</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.biz_reg_no_label")}</dt>
                <dd>328-11-02334</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.address_label")}</dt>
                <dd>인천광역시 부평구 충선로 87번길 10</dd>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Globe size={13} className="shrink-0 text-accent-400" />
                <dd className="font-medium text-white/70">{CONTACT.website}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-white">{t("footer.customer_center")}</h4>
            <ul className="space-y-2 text-[13px] text-white/55">
              <li>
                <button
                  onClick={onOpenContact}
                  className="flex items-center gap-2 text-left transition hover:text-white"
                >
                  <MessageCircle size={14} className="shrink-0 text-accent-400" />
                  <span>
                    {t("footer.kakao")}{" "}
                    <span className="font-semibold text-white/80">
                      {CONTACT.kakaoId}
                    </span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenContact}
                  className="flex items-center gap-2 text-left transition hover:text-white"
                >
                  <MessageCircle size={14} className="shrink-0 text-accent-400" />
                  <span>
                    {t("footer.wechat")}{" "}
                    <span className="font-semibold text-white/80">
                      {CONTACT.wechatId}
                    </span>
                  </span>
                </button>
              </li>
              <li className="flex items-center gap-2">
                <Clock size={14} className="shrink-0 text-accent-400" />
                <span>{t("footer.weekday_hours")}</span>
              </li>
            </ul>
            <LocalizedLink
              to="/counsel"
              className="mt-4 inline-block rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              {t("footer.counsel_cta")}
            </LocalizedLink>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-white">{t("footer.bank_transfer_title")}</h4>
            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[13px] leading-relaxed text-white/70">
              <Landmark size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <div>
                <p className="font-bold text-white">
                  {CONTACT.bank.bankName} {CONTACT.bank.accountNumber}
                </p>
                <p className="mt-0.5 text-white/50">
                  {t("footer.account_holder")} {CONTACT.bank.accountHolder}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/10 pt-6 text-center text-[12px] text-white/35 sm:flex-row sm:justify-between">
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex gap-4">
            <LocalizedLink to="/terms" className="transition hover:text-white">
              {t("footer.terms")}
            </LocalizedLink>
            <LocalizedLink to="/privacy" className="transition hover:text-white">
              {t("footer.privacy")}
            </LocalizedLink>
          </div>
        </div>
      </Container>
    </footer>
  );
}
