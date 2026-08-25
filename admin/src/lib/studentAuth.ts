import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const COOKIE_NAME = "student_session";

function sign(studentId: number): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return createHmac("sha256", secret).update(`student:${studentId}`).digest("hex");
}

export async function verifyStudentLogin(loginId: string, password: string): Promise<number | null> {
  const student = await prisma.student.findUnique({ where: { loginId } });
  if (!student || student.deletedAt || student.accountStatus !== "ACTIVE") return null;
  const ok = await bcrypt.compare(password, student.passwordHash);
  return ok ? student.id : null;
}

export async function createStudentSession(studentId: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, `${studentId}.${sign(studentId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroyStudentSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getStudentId(): Promise<number | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return null;
  const idPart = value.slice(0, dotIndex);
  const sigPart = value.slice(dotIndex + 1);
  const studentId = Number(idPart);
  if (!Number.isInteger(studentId)) return null;
  let expected: string;
  try {
    expected = sign(studentId);
  } catch {
    return null;
  }
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return studentId;
}

// status를 매 요청마다 다시 확인한다 — 관리자가 계정을 삭제/SUSPENDED/INACTIVE로
// 바꾸면 이 학생이 들고 있는 서명된 쿠키가 여전히 유효해도 다음 요청부터 즉시
// 차단되어야 한다(임퍼소네이션 세션도 동일한 student_session을 쓰므로 함께 적용됨).
export async function requireStudent() {
  const studentId = await getStudentId();
  if (!studentId) redirect("/student/login");
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.deletedAt || student.accountStatus !== "ACTIVE") redirect("/student/login");
  return student;
}

// 관리자 대리 로그인(impersonation) — 관리자 세션 쿠키는 그대로 두고 학생 세션만
// 추가로 발급하므로, 학생 화면을 둘러본 뒤 바로 관리자로 돌아올 수 있다. 이 플래그
// 쿠키는 학생 화면에 "대리 로그인 중" 배너를 띄우는 용도이며, 값 자체를 신뢰해
// 권한을 주지는 않는다(권한은 항상 서명된 student_session/admin_session으로 검사).
const IMPERSONATION_FLAG = "student_impersonation";

export async function startStudentImpersonation(studentId: number) {
  await createStudentSession(studentId);
  const store = await cookies();
  store.set(IMPERSONATION_FLAG, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function stopStudentImpersonation() {
  await destroyStudentSession();
  const store = await cookies();
  store.delete(IMPERSONATION_FLAG);
}

export async function isImpersonating(): Promise<boolean> {
  const store = await cookies();
  return store.get(IMPERSONATION_FLAG)?.value === "1";
}

export { COOKIE_NAME as STUDENT_COOKIE_NAME };
