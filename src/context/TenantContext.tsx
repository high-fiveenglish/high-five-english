// 접속 도메인 기준으로 "지금 어느 협력사 사이트인지" 판별해 브랜딩/회사정보/계좌를
// 제공한다. admin/src/app/api/public/agency-branding를 앱 시작 시 한 번 호출한다 —
// 응답이 오기 전이나 실패했을 때는 기존에 하드코딩돼 있던 본사(하이파이브) 정보를
// 그대로 기본값으로 써서, 이 기능이 추가되기 전과 동일하게 항상 뭔가는 보인다.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import i18n, { applyBrandDefaultVariables } from "../i18n/config";
import { brandSourceRef } from "../i18n/brandDefaults";
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
// 토큰으로 바꿔두고(src/locales/*/*.json), 그 토큰의 실제 값을 i18next 전역 기본
// 변수(interpolation.defaultVariables)로 주입한다(계산 자체는 config.ts의
// applyBrandDefaultVariables가 한다 — 언어 변경 시에도 호출되도록 그쪽에
// "languageChanged" 리스너로 등록돼 있다). 이 컴포넌트는 "언어와 무관한" tenant
// 입력(brandSourceRef)이 바뀔 때만 반응하면 된다 — 언어가 바뀌는 경우는
// config.ts의 리스너가 이미 처리하므로 여기서 i18n.language를 의존성으로 볼
// 필요가 없다(과거에는 두 관심사가 한 effect에 섞여 있어, 실제 언어 변경 이벤트가
// 이 effect를 "먼저" 트리거해 아직 갱신 전인 t()를 읽어버리는 경쟁 조건이 있었다).
function BrandNameSync({ branding }: { branding: AgencyBranding }) {
  useEffect(() => {
    // 약관/개인정보처리방침의 "개인정보 관리책임자" 같은 항목도 협력사 사이트에서는
    // 본사(우종범) 값이 아니라 그 협력사 값이 나와야 한다 — 본사 자체는 DB에 값이
    // 없어 하드코딩된 기본값으로 대체하지만, 협력사는 값이 비어있어도 본사 값으로
    // 대체하지 않는다(빈 문자열이면 해당 문구에서 그냥 빈칸으로 보인다).
    brandSourceRef.current = {
      isHeadquarters: branding.isHeadquarters,
      tenantName: branding.name,
      ceoName: branding.isHeadquarters ? (branding.biz.ceo ?? "우종범") : (branding.biz.ceo ?? ""),
      brandEmail: branding.isHeadquarters
        ? (branding.biz.email ?? "jongbum1010@hanmail.net")
        : (branding.biz.email ?? ""),
      brandPhone: branding.isHeadquarters
        ? (branding.biz.phone ?? "010-2777-5463")
        : (branding.biz.phone ?? ""),
    };
    applyBrandDefaultVariables(i18n.language);
    // tenant fetch가 첫 페인트 이후(비동기)에 끝나므로, 이미 렌더링된 컴포넌트들의
    // useTranslation이 새 값을 반영해 재렌더링되도록 강제로 한 번 emit한다.
    i18n.emit("languageChanged", i18n.language);
  }, [branding]);
  return null;
}

export function useTenant(): AgencyBranding {
  return useContext(TenantContext);
}
