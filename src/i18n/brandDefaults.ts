// i18next 전역 interpolation.defaultVariables(brandName/ceoName/brandEmail/brandPhone)를
// 계산하는 데 필요한 "언어와 무관한" 입력값을 config.ts와 TenantContext.tsx가 공유하기
// 위한 모듈. config.ts가 import하는 순환 의존성을 피하려고 TenantContext.tsx의
// AgencyBranding 타입을 그대로 쓰지 않고 필요한 필드만 가진 별도 타입을 둔다.
export interface BrandSource {
  isHeadquarters: boolean;
  /** 협력사 사이트일 때만 쓰는, 번역되지 않는 고정 브랜드명(headquarters면 무시됨 — brandName은 그 대신 locale별 footer.brand_name을 쓴다). */
  tenantName: string;
  ceoName: string;
  brandEmail: string;
  brandPhone: string;
}

export const DEFAULT_BRAND_SOURCE: BrandSource = {
  isHeadquarters: true,
  tenantName: "하이파이브 잉글리쉬",
  ceoName: "우종범",
  brandEmail: "jongbum1010@hanmail.net",
  brandPhone: "010-2777-5463",
};

/** TenantContext의 tenant fetch 결과를 담아두는 참조 — 아직 React state가 아니라
 * 모듈 레벨 mutable 값인 이유는 config.ts가 컴포넌트 마운트 전(모듈 로드 시점)에
 * 언어 변경 리스너를 등록해야 하기 때문이다(아래 config.ts 참고). */
export const brandSourceRef: { current: BrandSource } = { current: DEFAULT_BRAND_SOURCE };
