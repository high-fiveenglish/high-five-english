// 카카오 로그인 인가 화면 URL을 만든다. REST API 키는 카카오 로그인 표준 흐름에서
// 클라이언트(브라우저)에 그대로 노출되는 공개 값이라(URL 파라미터로 나감) 여기 있어도
// 안전하다 — 실제 비밀값(CLIENT_SECRET)은 admin 서버에만 있다(admin/src/lib/kakaoAuth.ts).
const KAKAO_REST_API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY ?? "d383ac9b7b1ef804b7e23735c494dbdd";

/** 로그인 흐름을 마친 뒤 카카오가 돌아올 주소 — 카카오 디벨로퍼스에 등록된 Redirect
 * URI와 정확히 일치해야 한다. 현재 실행 중인 origin 기준으로 계산하므로, 운영 도메인이
 * 정해지면 그 도메인의 `${origin}/kakao/callback`도 카카오 디벨로퍼스에 추가 등록해야
 * 한다(개발용 http://localhost:5173/kakao/callback은 이미 등록돼 있음). */
export const KAKAO_REDIRECT_URI = `${window.location.origin}/kakao/callback`;

export type KakaoAuthState = "login" | "link";

/** 카카오 인가 화면은 전체 페이지 이동(다른 도메인)이라 돌아왔을 때 이 SPA의
 * AuthContext(메모리 상태)는 전부 초기화돼 있다 — "연동" 흐름은 그 순간에도 어떤
 * 학생의 토큰인지 알아야 하므로, 이동 직전에만 잠깐 sessionStorage에 실어 보낸다
 * (KakaoCallbackPage가 다 쓰고 나면 바로 지운다). */
export const KAKAO_LINK_TOKEN_STORAGE_KEY = "kakao_link_student_token";

export function buildKakaoAuthorizeUrl(state: KakaoAuthState): string {
  const params = new URLSearchParams({
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: KAKAO_REDIRECT_URI,
    response_type: "code",
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}
