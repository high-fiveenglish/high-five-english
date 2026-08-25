import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { resolveRolePermissions, type Actor } from "./rbac";

const COOKIE_NAME = "admin_session";

// ADMIN/MANAGER 세션 — teacher_session/student_session과 동일한 서명된
// "{adminUserId}.{hmac}" 쿠키 패턴을 그대로 재사용한다.
function sign(adminUserId: number): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(`admin:${adminUserId}`).digest("hex");
}

export async function verifyBackofficeLogin(loginId: string, password: string): Promise<number | null> {
  const user = await prisma.adminUser.findUnique({ where: { loginId } });
  if (!user || user.status !== "ACTIVE") return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user.id : null;
}

export async function createBackofficeSession(adminUserId: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, `${adminUserId}.${sign(adminUserId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroyBackofficeSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getBackofficeUserId(): Promise<number | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return null;
  const idPart = value.slice(0, dotIndex);
  const sigPart = value.slice(dotIndex + 1);
  const adminUserId = Number(idPart);
  if (!Number.isInteger(adminUserId)) return null;
  let expected: string;
  try {
    expected = sign(adminUserId);
  } catch {
    return null;
  }
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return adminUserId;
}

// 페이지/서버 액션 양쪽에서 매 요청마다 호출 — DB를 다시 조회해 status===ACTIVE를
// 확인하므로, 관리자가 계정을 SUSPENDED/INACTIVE로 바꾸면 유효한 쿠키를 들고 있어도
// 다음 요청부터 즉시 차단된다(로그인 시점 확인만으로는 불충분).
export async function requireBackofficeActor(): Promise<Actor> {
  const adminUserId = await getBackofficeUserId();
  if (!adminUserId) redirect("/login");

  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!user || user.status !== "ACTIVE") redirect("/login");

  if (user.role === "ADMIN") {
    return { role: "ADMIN", id: user.id, name: user.name };
  }
  const permissions = await resolveRolePermissions(user.role);
  return { role: user.role, id: user.id, name: user.name, permissions };
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME };
