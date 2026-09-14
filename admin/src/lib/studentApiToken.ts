import { createHmac, timingSafeEqual } from "crypto";

// 마케팅 사이트(Vite)가 "정보변경" 화면을 자기 안에서 직접 그리면서 admin에 저장
// 요청까지 보내려면, 쿠키가 아닌 다른 신원 증명이 필요하다 — 쿠키(student_session)는
// SameSite 정책상 cross-origin fetch에는 실리지 않고 top-level 페이지 이동에만
// 실리기 때문이다(그래서 "정보변경 → admin 페이지로 이동"은 되지만 "Vite 화면 안에서
// 바로 저장"은 안 됐다). 이 토큰은 로그인 응답에 실어 보내고, Vite가 메모리에만
// 들고 있다가(새로고침하면 사라짐 — 이 앱의 다른 세션 상태와 동일한 수명) 정보변경
// 저장/조회 요청의 Authorization 헤더에 실어 보낸다. student_session 쿠키 서명과
// 같은 비밀키(ADMIN_SESSION_SECRET)를 쓰되, 서명 대상 문자열 앞에 "student-api:"를
// 붙여 다른 용도의 서명(SSO 토큰 등)과 절대 섞여 쓰이지 않게 한다.
export interface StudentApiTokenPayload {
  studentId: number;
  iat: number;
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 — 한 세션 동안 쓰기엔 충분하고, 유출 시 노출 창은 제한적.

function sign(data: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(`student-api:${data}`).digest("hex");
}

export function createStudentApiToken(studentId: number): string {
  const payload: StudentApiTokenPayload = { studentId, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyStudentApiToken(token: string): StudentApiTokenPayload | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;
  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  let expected: string;
  try {
    expected = sign(data);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: StudentApiTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.studentId !== "number" || typeof payload.iat !== "number") return null;
  if (Date.now() - payload.iat > TOKEN_TTL_MS) return null;
  return payload;
}

/** Request의 Authorization: Bearer <token> 헤더에서 검증된 studentId를 뽑아낸다. */
export function studentIdFromAuthHeader(request: Request): number | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  const payload = verifyStudentApiToken(match[1]);
  return payload?.studentId ?? null;
}
