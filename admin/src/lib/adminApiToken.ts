import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { resolveRolePermissions, type Actor } from "./rbac";
import type { RoleName } from "../generated/prisma/client";

// studentApiToken.ts와 동일한 이유로 존재 — 마케팅 사이트(Vite)의 자체 관리자 패널
// (/admin/pricing, /admin/home-notices 등)이 admin_session 쿠키(SameSite=Lax) 없이도
// cross-origin에서 실제 DB에 쓰기 요청을 보낼 수 있어야 한다. admin-login 응답에 실어
// 보내고, Vite가 메모리에만 들고 있다가(새로고침하면 사라짐) 쓰기 요청의 Authorization
// 헤더에 실어 보낸다. 서명 대상 문자열 앞에 "admin-api:"를 붙여 student-api 토큰과
// 섞이지 않게 한다.
export interface AdminApiTokenPayload {
  adminUserId: number;
  role: RoleName;
  iat: number;
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 — student-api와 동일한 수명.

function sign(data: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(`admin-api:${data}`).digest("hex");
}

export function createAdminApiToken(adminUserId: number, role: RoleName): string {
  const payload: AdminApiTokenPayload = { adminUserId, role, iat: Date.now() };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyAdminApiToken(token: string): AdminApiTokenPayload | null {
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

  let payload: AdminApiTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.adminUserId !== "number" || typeof payload.role !== "string" || typeof payload.iat !== "number") {
    return null;
  }
  if (Date.now() - payload.iat > TOKEN_TTL_MS) return null;
  return payload;
}

/** Request의 Authorization: Bearer <token> 헤더에서 검증된 관리자 정보를 뽑아낸다. */
export function adminFromAuthHeader(request: Request): AdminApiTokenPayload | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;
  return verifyAdminApiToken(match[1]);
}

/** studentIdFromAuthHeader 이후 매번 하던 "토큰 검증 → DB 재조회(status===ACTIVE 확인)
 * → 권한 목록 resolve" 3단계를 한 번에 묶는다 — /api/public/* 쓰기 라우트들이 반복
 * 재구현하지 않도록. requireBackofficeActor(쿠키 기반)와 동일한 재검증 정책이지만
 * Bearer 토큰 기반이라는 점만 다르다. */
export async function actorFromAdminApiToken(request: Request): Promise<Actor | null> {
  const payload = adminFromAuthHeader(request);
  if (!payload) return null;

  const user = await prisma.adminUser.findUnique({ where: { id: payload.adminUserId } });
  if (!user || user.status !== "ACTIVE") return null;

  if (user.role === "ADMIN") return { role: "ADMIN", id: user.id, name: user.name };
  const permissions = await resolveRolePermissions(user.role);
  if (user.role === "AGENT") {
    if (!user.agentId) return null;
    return { role: "AGENT", id: user.id, name: user.name, permissions, agentId: user.agentId };
  }
  return { role: user.role, id: user.id, name: user.name, permissions };
}
