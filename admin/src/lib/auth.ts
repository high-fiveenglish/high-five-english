import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_session";
const TOKEN_PAYLOAD = "hifive-admin-session";

// MVP: 단일 관리자 계정(비밀번호 하나)만 지원한다. 관리자별 계정/역할 분리는
// 이후 라운드에서 admins 테이블 + 비밀번호 해시로 확장한다.
function expectedToken(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return createHmac("sha256", secret).update(TOKEN_PAYLOAD).digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // 길이가 다르면 timingSafeEqual이 바로 던지므로, 같은 길이의 더미 버퍼와 비교해
  // 길이 자체로 정보가 새지 않게 한다.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function verifyLogin(id: string, password: string): boolean {
  const expectedId = process.env.ADMIN_ID;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedId || !expectedPassword) {
    throw new Error("ADMIN_ID/ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  const idOk = timingSafeStringEqual(id, expectedId);
  const passwordOk = timingSafeStringEqual(password, expectedPassword);
  return idOk && passwordOk;
}

export async function createSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7일
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return false;
  const expected = expectedToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { COOKIE_NAME };
