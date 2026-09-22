// 접속 도메인 기준으로 "지금 어느 협력사 사이트인지" 판별해 브랜딩/회사정보/계좌를
// 제공한다. admin/src/app/api/public/agency-branding를 앱 시작 시 한 번 호출한다 —
// 응답이 오기 전이나 실패했을 때는 기존에 하드코딩돼 있던 본사(하이파이브) 정보를
// 그대로 기본값으로 써서, 이 기능이 추가되기 전과 동일하게 항상 뭔가는 보인다.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ADMIN_API_URL, getTenantDomain } from "../lib/adminApi";

export type AgencyBranding = {
  agentId: number;
  code: string;
  name: string;
  isHeadquarters: boolean;
  domain: string | null;
  logoUrl: string | null;
  brandTagline: string | null;
  biz: {
    name: string | null;
    ceo: string | null;
    regNo: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    mailOrderNo: string | null;
  };
  bank: { name: string | null; accountNumber: string | null; accountHolder: string | null };
};

export const DEFAULT_BRANDING: AgencyBranding = {
  agentId: 0,
  code: "highfive",
  name: "하이파이브 잉글리쉬",
  isHeadquarters: true,
  domain: null,
  logoUrl: null,
  brandTagline: null,
  biz: {
    name: "하이파이브 잉글리쉬",
    ceo: "우종범",
    regNo: "328-11-02334",
    address: "인천광역시 부평구 충선로 87번길 10",
    phone: null,
    email: null,
    mailOrderNo: null,
  },
  bank: { name: "신한은행", accountNumber: "110-288-553436", accountHolder: "하이파이브 잉글리쉬(우종범)" },
};

const TenantContext = createContext<AgencyBranding>(DEFAULT_BRANDING);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<AgencyBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    const domain = getTenantDomain();
    fetch(`${ADMIN_API_URL}/api/public/agency-branding?domain=${encodeURIComponent(domain)}`)
      .then((res) => (res.ok ? (res.json() as Promise<AgencyBranding>) : null))
      .then((data) => {
        if (data) setBranding(data);
      })
      .catch(() => {
        /* 관리자 서버에 연결 안 되면 기본(본사) 브랜딩을 그대로 유지한다. */
      });
  }, []);

  return (
    <TenantContext.Provider value={branding}>
      <BrandNameSync branding={branding} />
      {children}
    </TenantContext.Provider>
  );
}

// 번역 문구 전체(약관/FAQ/회사소개 등 수백 곳)에 하드코딩된 "하이파이브 잉글리쉬"를
// 협력사 사이트에서는 절대 노출하지 않기 위한 장치 — 각 문구를 "{{brandName}}"
// 토큰으로 바꿔두고(src/locales/*/*.json), 그 토큰의 실제 값을 여기서 i18next
// 전역 기본 변수(interpolation.defaultVariables)로 주입한다. t() 호출마다 일일이
// brandName을 넘길 필요 없이 모든 t() 결과에 자동 적용된다. defaultVariables를
// 바꾼 뒤 languageChanged를 강제로 emit해야 이미 렌더링된 다른 컴포넌트들의
// useTranslation도 이 값을 반영해 재렌더링된다(단순 대입만으로는 리렌더가 안 됨).
function BrandNameSync({ branding }: { branding: AgencyBranding }) {
  const { t, i18n } = useTranslation("common");
  useEffect(() => {
    const brandName = branding.isHeadquarters ? t("footer.brand_name") : branding.name;
    // 약관/개인정보처리방침의 "개인정보 관리책임자" 같은 항목도 협력사 사이트에서는
    // 본사(우종범) 값이 아니라 그 협력사 값이 나와야 한다 — 본사 자체는 DB에 값이
    // 없어 하드코딩된 기본값으로 대체하지만, 협력사는 값이 비어있어도 본사 값으로
    // 대체하지 않는다(빈 문자열이면 해당 문구에서 그냥 빈칸으로 보인다).
    const ceoName = branding.isHeadquarters ? (branding.biz.ceo ?? "우종범") : (branding.biz.ceo ?? "");
    const brandEmail = branding.isHeadquarters
      ? (branding.biz.email ?? "jongbum1010@hanmail.net")
      : (branding.biz.email ?? "");
    const brandPhone = branding.isHeadquarters
      ? (branding.biz.phone ?? "010-2777-5463")
      : (branding.biz.phone ?? "");
    i18n.options.interpolation = {
      ...i18n.options.interpolation,
      defaultVariables: { brandName, ceoName, brandEmail, brandPhone },
    };
    i18n.emit("languageChanged", i18n.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t 자체가 아니라 language 변경 시에만 재계산하면 충분
  }, [branding, i18n.language]);
  return null;
}

export function useTenant(): AgencyBranding {
  return useContext(TenantContext);
}
