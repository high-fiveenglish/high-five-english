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
  if (!student) return null;
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

export async function requireStudent() {
  const studentId = await getStudentId();
  if (!studentId) redirect("/student/login");
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) redirect("/student/login");
  return student;
}

export { COOKIE_NAME as STUDENT_COOKIE_NAME };
