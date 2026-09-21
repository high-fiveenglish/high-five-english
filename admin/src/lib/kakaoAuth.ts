// 카카오 로그인 인가코드(authorization code) → 액세스 토큰 → 카카오 회원번호 교환.
// CLIENT_SECRET을 다루므로 반드시 이 서버(admin)에서만 실행한다 — 마케팅 사이트(Vite)는
// 인가 URL로 리다이렉트만 시키고, 돌아온 code를 이 서버로 넘겨 나머지를 처리시킨다.
type KakaoExchangeResult = { kakaoUserId: string } | { error: string };

export async function exchangeKakaoCode(code: string, redirectUri: string): Promise<KakaoExchangeResult> {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (!restApiKey || !clientSecret) {
    return { error: "kakao_not_configured" };
  }

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: restApiKey,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
  } catch {
    return { error: "kakao_token_request_failed" };
  }
  if (!tokenRes.ok) {
    return { error: "kakao_token_exchange_failed" };
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return { error: "kakao_token_exchange_failed" };
  }

  let userRes: Response;
  try {
    userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
  } catch {
    return { error: "kakao_user_info_failed" };
  }
  if (!userRes.ok) {
    return { error: "kakao_user_info_failed" };
  }
  const userData = (await userRes.json()) as { id?: number };
  if (!userData.id) {
    return { error: "kakao_user_info_failed" };
  }

  return { kakaoUserId: String(userData.id) };
}
