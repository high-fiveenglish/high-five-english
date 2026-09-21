import { useTranslation } from "react-i18next";
import { MessageCircle, Clock, Landmark, Globe } from "lucide-react";
import { Container } from "../ui/Container";
import { CONTACT } from "../../data/contact";
import { useTenant } from "../../context/TenantContext";
import { BrandMark } from "./BrandMark";
import { LocalizedLink } from "../i18n/LocalizedLink";

export function Footer({ onOpenContact }: { onOpenContact: () => void }) {
  const { t } = useTranslation("common");
  const tenant = useTenant();
  // 협력사 사이트는 회사정보/계좌를 그 협력사 값으로 대체한다 — 값이 비어있는 항목은
  // (아직 관리자가 안 채운 경우) 본사 기본값으로 떨어진다.
  const company = {
    name: tenant.biz.name ?? CONTACT.company.name,
    ceo: tenant.biz.ceo ?? CONTACT.company.ceo,
    bizRegNo: tenant.biz.regNo ?? CONTACT.company.bizRegNo,
    address: tenant.biz.address ?? CONTACT.company.address,
    // 상담전화/이메일/통신판매업신고번호는 본사 기본값이 아직 없어 협력사에만 값이
    // 있을 때만 표시한다(비어있으면 행 자체를 렌더링하지 않음).
    phone: tenant.biz.phone,
    email: tenant.biz.email,
    mailOrderNo: tenant.biz.mailOrderNo,
  };
  const bank = {
    bankName: tenant.bank.name ?? CONTACT.bank.bankName,
    accountNumber: tenant.bank.accountNumber ?? CONTACT.bank.accountNumber,
    accountHolder: tenant.bank.accountHolder ?? CONTACT.bank.accountHolder,
  };

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
                <dd>{company.name}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.ceo_label")}</dt>
                <dd>{company.ceo}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.biz_reg_no_label")}</dt>
                <dd>{company.bizRegNo}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">{t("footer.address_label")}</dt>
                <dd>{company.address}</dd>
              </div>
              {company.phone && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.phone_label")}</dt>
                  <dd>{company.phone}</dd>
                </div>
              )}
              {company.email && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.email_label")}</dt>
                  <dd>{company.email}</dd>
                </div>
              )}
              {company.mailOrderNo && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.mail_order_no_label")}</dt>
                  <dd>{company.mailOrderNo}</dd>
                </div>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <Globe size={13} className="shrink-0 text-accent-400" />
                <dd className="font-medium text-white/70">{tenant.domain ?? CONTACT.website}</dd>
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
                  {bank.bankName} {bank.accountNumber}
                </p>
                <p className="mt-0.5 text-white/50">
                  {t("footer.account_holder")} {bank.accountHolder}
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
