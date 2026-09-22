import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Clock, Landmark, Globe } from "lucide-react";
import { Container } from "../ui/Container";
import { CONTACT } from "../../data/contact";
import { useTenant } from "../../context/TenantContext";
import { BrandMark } from "./BrandMark";
import { LocalizedLink } from "../i18n/LocalizedLink";
import { listActiveConsultChannels } from "../../services/consultChannelService";
import type { ConsultChannel } from "../../lib/community/types";

export function Footer({ onOpenContact }: { onOpenContact: () => void }) {
  const { t } = useTranslation("common");
  const tenant = useTenant();
  // 카카오톡/위챗 표시는 더 이상 본사 값을 하드코딩해서 보여주지 않는다 — 협력사가
  // 관리자 화면(/agencies/:id)에서 직접 설정한 채널만 뜨고, 아직 설정 안 했으면(본사
  // 채널로 대체하지 않고) 그냥 빈칸으로 둔다.
  // listActiveConsultChannels()는 내부적으로 getTenantDomain()(window.location 기준)만
  // 보고 도메인을 정하지, tenant(agentId)를 인자로 넘기지 않는다 — 즉 이 값은 처음부터
  // 마운트 시점에 이미 확정돼 있어 tenant가 "준비"될 때까지 기다릴 필요가 없다.
  // 예전엔 [tenant.agentId]가 의존성에 있어서 TenantContext가 기본값(agentId: 0)에서
  // 실제 값으로 바뀔 때 같은 데이터를 한 번 더(불필요하게) 요청했다 — 마운트 시 한
  // 번만 부르도록 고쳐서 그 중복을 없앤다.
  const [channels, setChannels] = useState<ConsultChannel[]>([]);
  useEffect(() => {
    listActiveConsultChannels().then(setChannels);
  }, []);
  const kakao = channels.find((c) => c.id === "kakao");
  const wechat = channels.find((c) => c.id === "wechat");
  // 협력사 사이트는 회사정보/계좌를 그 협력사 값으로 대체한다. 본사(highfive) 자체는
  // DB에 사업자 정보를 입력해두지 않아 하드코딩된 CONTACT 기본값으로 대체하지만,
  // 협력사는 값이 비어있어도 본사 값으로 대체하지 않고 그냥 빈칸(행 미노출)으로
  // 둔다 — 협력사 화면에 본사 사업자 정보가 새어나가면 안 되기 때문이다.
  const company = {
    name: tenant.isHeadquarters ? (tenant.biz.name ?? CONTACT.company.name) : tenant.biz.name,
    ceo: tenant.isHeadquarters ? (tenant.biz.ceo ?? CONTACT.company.ceo) : tenant.biz.ceo,
    bizRegNo: tenant.isHeadquarters ? (tenant.biz.regNo ?? CONTACT.company.bizRegNo) : tenant.biz.regNo,
    address: tenant.isHeadquarters ? (tenant.biz.address ?? CONTACT.company.address) : tenant.biz.address,
    phone: tenant.biz.phone,
    email: tenant.biz.email,
    mailOrderNo: tenant.biz.mailOrderNo,
  };
  const bank = {
    bankName: tenant.isHeadquarters ? (tenant.bank.name ?? CONTACT.bank.bankName) : tenant.bank.name,
    accountNumber: tenant.isHeadquarters
      ? (tenant.bank.accountNumber ?? CONTACT.bank.accountNumber)
      : tenant.bank.accountNumber,
    accountHolder: tenant.isHeadquarters
      ? (tenant.bank.accountHolder ?? CONTACT.bank.accountHolder)
      : tenant.bank.accountHolder,
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
              {company.name && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.biz_name_label")}</dt>
                  <dd>{company.name}</dd>
                </div>
              )}
              {company.ceo && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.ceo_label")}</dt>
                  <dd>{company.ceo}</dd>
                </div>
              )}
              {company.bizRegNo && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.biz_reg_no_label")}</dt>
                  <dd>{company.bizRegNo}</dd>
                </div>
              )}
              {company.address && (
                <div className="flex gap-1.5">
                  <dt className="shrink-0 text-white/35">{t("footer.address_label")}</dt>
                  <dd>{company.address}</dd>
                </div>
              )}
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
              {kakao && (
                <li>
                  <button
                    onClick={onOpenContact}
                    className="flex items-center gap-2 text-left transition hover:text-white"
                  >
                    <MessageCircle size={14} className="shrink-0 text-accent-400" />
                    <span>
                      {t("footer.kakao")}{" "}
                      <span className="font-semibold text-white/80">{kakao.value}</span>
                    </span>
                  </button>
                </li>
              )}
              {wechat && (
                <li>
                  <button
                    onClick={onOpenContact}
                    className="flex items-center gap-2 text-left transition hover:text-white"
                  >
                    <MessageCircle size={14} className="shrink-0 text-accent-400" />
                    <span>
                      {t("footer.wechat")}{" "}
                      <span className="font-semibold text-white/80">{wechat.value}</span>
                    </span>
                  </button>
                </li>
              )}
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

          {bank.bankName && (
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
          )}
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
