import { useAuth } from "../../context/AuthContext";
import { ADMIN_API_URL } from "../../lib/adminApi";

// 관리자의 "회원으로 로그인"(SSO)으로 들어온 세션에서만 보이는 안내 배너. 새로고침하면
// 이 세션 자체가 초기화되므로(AuthContext가 영속화되지 않음), "돌아가기"는 별도 로그아웃
// API 호출 없이 그냥 admin 사이트로 이동하는 것으로 충분하다 — admin 쪽 관리자 세션은
// 애초에 건드린 적이 없어 그대로 유지된다.
export function ImpersonationBanner() {
  const { isImpersonating, userName, logout } = useAuth();
  if (!isImpersonating) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-[13px] font-semibold text-amber-950">
      <span>관리자가 {userName ?? "학생"} 계정으로 대리 로그인 중입니다.</span>
      <a
        href={`${ADMIN_API_URL}/students`}
        onClick={() => logout()}
        className="rounded-md bg-amber-950/10 px-2.5 py-1 hover:bg-amber-950/20"
      >
        관리자로 돌아가기
      </a>
    </div>
  );
}
