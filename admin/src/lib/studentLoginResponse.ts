import { prisma } from "./prisma";
import { createStudentApiToken } from "./studentApiToken";
import { TEACHER_SUMMARY_SELECT } from "./teacherSelect";
import { getStudentProfileSnapshot } from "./studentProfileUpdate";

// 아이디/비밀번호 로그인(student-login)과 카카오 로그인(kakao-login) 둘 다, 로그인이
// 확정된 뒤 마케팅 사이트(Vite)에 돌려주는 응답 모양이 완전히 같다 — 그 응답 구성
// 로직의 단일 출처.
export async function buildStudentLoginPayload(studentId: number) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.deletedAt) return null;

  const [enrollment, profile] = await Promise.all([
    prisma.enrollment.findFirst({
      where: { studentId, status: { in: ["ACTIVE", "PAID", "APPLIED"] } },
      orderBy: { id: "desc" },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
    }),
    getStudentProfileSnapshot(studentId),
  ]);

  return {
    studentId: student.id,
    loginId: student.loginId,
    name: student.name,
    englishName: student.englishName,
    apiToken: createStudentApiToken(student.id),
    profile,
    enrollment: enrollment
      ? {
          scheduleDays: enrollment.scheduleDays,
          classTime: enrollment.classTime,
          classTimes: enrollment.classTimes,
          classDurationMin: enrollment.classDurationMin,
          totalSessions: enrollment.totalSessions,
          startDate: enrollment.startDate.toISOString().slice(0, 10),
          endDate: enrollment.endDate.toISOString().slice(0, 10),
          classMethod: enrollment.classMethod,
          textbookName: enrollment.textbookName,
          teacherName: enrollment.teacher?.realName ?? null,
        }
      : null,
  };
}
