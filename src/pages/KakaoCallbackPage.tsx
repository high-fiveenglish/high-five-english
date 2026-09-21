import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { KAKAO_REDIRECT_URI, KAKAO_LINK_TOKEN_STORAGE_KEY, type KakaoAuthState } from "../lib/kakaoAuth";
import { linkKakao, getMyProfile } from "../services/studentProfileService";
import { linkedIdForRealStudent } from "../lib/realStudentBridge";

// 카카오 인가 화면에서 돌아오는 착지 페이지. SsoLoginPage와 마찬가지로 리다이렉트
// 중간 다리 역할만 하는 화면이라 다국어 처리 없이 한국어 안내만 보여준다. state
// 파라미터로 두 흐름을 구분한다:
// - "login": 로그인 화면의 "카카오로 로그인" 버튼에서 옴 — 아직 로그아웃 상태이므로
//   loginWithKakao로 바로 로그인을 시도한다.
// - "link": 마이페이지(정보변경)의 "카카오 연동" 버튼에서 옴. 카카오 인가 화면은 다른
//   도메인으로의 완전한 페이지 이동이라, 돌아왔을 때 이 SPA의 로그인 세션(AuthContext,
//   메모리 상태)은 이미 전부 사라진 상태다 — 그래서 (1) 이동 직전 MyInfoPage가
//   sessionStorage에 남겨둔 토큰으로 연동 API를 호출하고, (2) 성공하면 그 토큰으로
//   프로필을 다시 조회해 hydrateActor로 로그인 세션 자체를 복구한다(안 그러면 연동은
//   성공해놓고 마이페이지엔 로그아웃 상태로 도착하는 것처럼 보인다).
export function KakaoCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithKakao, studentApiToken, hydrateActor } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get("code");
    const state = (searchParams.get("state") as KakaoAuthState | null) ?? "login";
    const kakaoError = searchParams.get("error");

    if (kakaoError || !code) {
      setError("카카오 로그인이 취소되었거나 실패했습니다.");
      return;
    }

    (async () => {
      if (state === "link") {
        let token: string | null = studentApiToken;
        try {
          token = token ?? sessionStorage.getItem(KAKAO_LINK_TOKEN_STORAGE_KEY);
        } catch {
          /* 프라이빗 모드 등으로 읽기가 막히면 그냥 null로 취급한다. */
        }
        if (!token) {
          setError("로그인 후 마이페이지에서 다시 시도해주세요.");
          return;
        }

        const linkRes = await linkKakao(token, code, KAKAO_REDIRECT_URI);
        if (!linkRes.ok) {
          setError(
            linkRes.error.code === "ALREADY_LINKED"
              ? "이미 다른 계정에 연동된 카카오 계정입니다."
              : "카카오 연동에 실패했습니다.",
          );
          return;
        }

        // 연동은 됐으니, 같은 토큰으로 최신 프로필을 다시 읽어 로그인 세션을 복구한다.
        const profileRes = await getMyProfile(token);
        try {
          sessionStorage.removeItem(KAKAO_LINK_TOKEN_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        if (profileRes.ok) {
          const linkedId = linkedIdForRealStudent(profileRes.value.studentId);
          hydrateActor(
            { role: "student", accountId: linkedId, linkedId, permissions: [] },
            profileRes.value.englishName || profileRes.value.name,
            null,
            token,
            profileRes.value,
          );
        }
        navigate("/mypage", { replace: true });
        return;
      }

      const result = await loginWithKakao(code, KAKAO_REDIRECT_URI);
      if (!result.ok) {
        setError(
          result.code === "NOT_LINKED"
            ? "연동된 계정이 없습니다. 아이디/비밀번호로 로그인 후 마이페이지에서 카카오 연동을 먼저 진행해주세요."
            : "카카오 로그인에 실패했습니다.",
        );
        return;
      }
      navigate(result.role === "student" ? "/classroom" : "/", { replace: true });
    })();
  }, [searchParams, loginWithKakao, studentApiToken, hydrateActor, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p className="max-w-sm text-sm text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => navigate("/", { replace: true })}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          홈으로
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-400">카카오 로그인 처리 중입니다...</p>
    </div>
  );
}
