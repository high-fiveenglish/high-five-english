import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const COOKIE_NAME = "teacher_session";

// 관리자 세션(비밀번호 1개, 값 자체가 토큰)과 달리 강사 세션은 "어느 강사인지"를
// 담아야 하므로, teacherId를 평문으로 넣되 서버만 아는 비밀키로 서명해 위조를 막는다
// (쿠키값 = "{teacherId}.{hmac}"). DB 세션 테이블 없이도 무상태로 검증 가능하다.
function sign(teacherId: number): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(`teacher:${teacherId}`).digest("hex");
}

export async function verifyTeacherLogin(loginId: string, password: string): Promise<number | null> {
  const teacher = await prisma.teacher.findUnique({ where: { loginId } });
  if (!teacher || teacher.accountStatus !== "ACTIVE") return null;
  const ok = await bcrypt.compare(password, teacher.passwordHash);
  return ok ? teacher.id : null;
}

export async function createTeacherSession(teacherId: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, `${teacherId}.${sign(teacherId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7일
  });
}

export async function destroyTeacherSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getTeacherId(): Promise<number | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return null;

  const idPart = value.slice(0, dotIndex);
  const sigPart = value.slice(dotIndex + 1);
  const teacherId = Number(idPart);
  if (!Number.isInteger(teacherId)) return null;

  let expected: string;
  try {
    expected = sign(teacherId);
  } catch {
    return null;
  }
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return teacherId;
}

// 페이지/서버 액션에서 "이 강사 세션이 실제로 존재하고, 아직 유효한 강사 계정인지"를
// 한 번에 확인하는 헬퍼 — proxy.ts는 서명만 검증하고 DB는 안 보므로(무상태 검증),
// 탈퇴/비활성 처리된 강사가 예전 쿠키로 계속 접근하는 걸 막으려면 실제 사용 지점에서
// DB까지 다시 확인해야 한다.
// status를 매 요청마다 다시 확인한다 — 관리자가 계정을 SUSPENDED/INACTIVE로 바꾸면
// 이 강사가 들고 있는 서명된 쿠키가 여전히 유효해도 다음 요청부터 즉시 차단되어야 한다.
export async function requireTeacher() {
  const teacherId = await getTeacherId();
  if (!teacherId) redirect("/teacher/login");

  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher || teacher.accountStatus !== "ACTIVE") redirect("/teacher/login");

  return teacher;
}

// 관리자(매니저) 대리 로그인 — studentAuth.ts의 동일 패턴 참고. admin_session은 그대로
// 두고 teacher_session만 추가 발급하므로 강사 화면을 둘러본 뒤 바로 관리자로 돌아올 수
// 있다. 이 플래그 쿠키는 배너 표시 용도일 뿐, 값 자체로 권한을 주지 않는다.
const IMPERSONATION_FLAG = "teacher_impersonation";

export async function startTeacherImpersonation(teacherId: number) {
  await createTeacherSession(teacherId);
  const store = await cookies();
  store.set(IMPERSONATION_FLAG, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function stopTeacherImpersonation() {
  await destroyTeacherSession();
  const store = await cookies();
  store.delete(IMPERSONATION_FLAG);
}

export async function isImpersonatingTeacher(): Promise<boolean> {
  const store = await cookies();
  return store.get(IMPERSONATION_FLAG)?.value === "1";
}

export { COOKIE_NAME as TEACHER_COOKIE_NAME };
