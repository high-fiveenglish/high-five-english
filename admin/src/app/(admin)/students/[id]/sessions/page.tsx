import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { AdminSessionCalendar } from "./AdminSessionCalendar";

export default async function StudentSessionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);

  const [student, sessions, enrollments] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.classSession.findMany({
      where: { studentId },
      orderBy: { scheduledAt: "asc" },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT }, evaluation: true, leaveRequest: true },
    }),
    prisma.enrollment.findMany({
      where: { studentId, status: { in: ["ACTIVE", "APPLIED"] } },
      orderBy: { id: "desc" },
      include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
    }),
  ]);

  if (!student || student.deletedAt) notFound();

  return (
    <div>
      <Link href="/students" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 학생관리로
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">수업관리 — {student.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        수업을 클릭하면 상세 정보와 처리 옵션이 나옵니다. 학생연기는 학생의 연기 가능 횟수에서 차감되고, 관리자연기는
        차감되지 않습니다.
      </p>

      <AdminSessionCalendar
        studentId={studentId}
        sessions={sessions.map((s) => ({
          id: s.id,
          scheduledAt: s.scheduledAt,
          durationMin: s.durationMin,
          status: s.status,
          teacherName: s.teacher.realName,
          evaluationId: s.evaluation ? s.id : null,
          leaveReason: s.leaveRequest?.reason ?? null,
          leaveRequestId: s.leaveRequest?.id ?? null,
          isSupplement: s.isSupplement,
        }))}
        enrollments={enrollments.map((e) => ({
          id: e.id,
          label: `${e.teacher?.realName ?? "미배정"} · ${e.classDurationMin}분 · ${e.startDate.toISOString().slice(0, 10)}~${e.endDate.toISOString().slice(0, 10)}`,
          classDurationMin: e.classDurationMin,
          hasTeacher: !!e.teacherId,
        }))}
      />
    </div>
  );
}
