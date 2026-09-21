// Base URL of the separate admin/LMS backend (Next.js + Prisma + PostgreSQL, see
// admin/src/app/api/public/*). Only /api/public/* routes there accept unauthenticated
// cross-origin requests — everything else requires the admin session cookie and is not
// reachable from this site.
export const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:3001";

// 이 사이트의 실제 접속 도메인 — admin의 협력사별 공개 API(agency-branding, pricing,
// consult-channels, home-notices, reviews, student-signup)가 전부 이 값으로 "지금 어느
// 협력사 사이트인지" 판별한다. 로컬 개발 중에는 실제 협력사 도메인으로 접속할 수 없으니
// ?previewDomain=으로 원하는 도메인을 흉내 낼 수 있다(예: ?previewDomain=mnmenglish.com) —
// TenantContext와 반드시 같은 로직을 써야 화면(로고/회사정보)과 데이터(가격표/공지/
// 후기)가 같은 협력사로 일치한다.
export function getTenantDomain(): string {
  const previewDomain = new URLSearchParams(window.location.search).get("previewDomain");
  return previewDomain || window.location.hostname;
}
