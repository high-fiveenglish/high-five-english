// MVP는 단일 브랜드(하이파이브 잉글리쉬) 운영 — 모든 쿼리/생성 로직에 이 상수를 통해
// siteId를 넣어두면, 이후 멀티테넌트로 확장할 때 이 값만 요청 컨텍스트에서 가져오도록
// 바꾸면 되고 테이블 구조나 쿼리 자체는 손댈 필요가 없다.
export const DEFAULT_SITE_ID = 1;

// 회원등급이 "일반회원"(GENERAL)인 학생의 기본 협력사 — seed.ts에서 심어두는 자체 운영
// 에이전트(직영에이전트)의 code. 다른 협력사를 명시적으로 고르지 않은 일반회원은 이
// 값으로 기본 배정된다.
export const HIGHFIVE_AGENT_CODE = "highfive";
