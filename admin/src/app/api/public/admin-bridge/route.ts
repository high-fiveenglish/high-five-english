import { NextResponse } from "next/server";
import { verifyAdminBridgeToken } from "@/lib/adminBridgeToken";
import { createBackofficeSession } from "@/lib/backofficeAuth";

// admin-login이 발급한 1회용 토큰을, 마케팅 사이트가 크로스 오리진 fetch가 아니라
// 실제 페이지 이동(<a href>)으로 열어주는 엔드포인트. 여기서 세션 쿠키를 심으면 admin
// 자신이 1st-party로 응답하는 상황이라 서드파티 쿠키 차단의 영향을 받지 않는다.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const payload = verifyAdminBridgeToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/login", url));
  }
  await createBackofficeSession(payload.adminUserId);
  return NextResponse.redirect(new URL("/", url));
}
