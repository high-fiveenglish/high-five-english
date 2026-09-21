// 접속 도메인 기준으로 "지금 어느 협력사 사이트인지" 판별해 브랜딩/회사정보/계좌를
// 제공한다. admin/src/app/api/public/agency-branding를 앱 시작 시 한 번 호출한다 —
// 응답이 오기 전이나 실패했을 때는 기존에 하드코딩돼 있던 본사(하이파이브) 정보를
// 그대로 기본값으로 써서, 이 기능이 추가되기 전과 동일하게 항상 뭔가는 보인다.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ADMIN_API_URL, getTenantDomain } from "../lib/adminApi";

export type AgencyBranding = {
  agentId: number;
  code: string;
  name: string;
  isHeadquarters: boolean;
  domain: string | null;
  logoUrl: string | null;
  brandTagline: string | null;
  biz: { name: string | null; ceo: string | null; regNo: string | null; address: string | null };
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

  return <TenantContext.Provider value={branding}>{children}</TenantContext.Provider>;
}

export function useTenant(): AgencyBranding {
  return useContext(TenantContext);
}
