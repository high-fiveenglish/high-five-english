import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { TeacherCalendarView } from "./TeacherCalendarView";
import { formatAppDate } from "@/lib/appTime";
import { ENGLISH_LEVEL_OPTIONS } from "@/lib/levelTestOptions";

const fmtDate = formatAppDate;

const ENGLISH_LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  ENGLISH_LEVEL_OPTIONS.map((o) => [o.value, o.label]),
);

export default async function TeacherSchedulePage() {
  const teacher = await requireTeacher();

  // 다른 강사의 수업/레벨테스트가 섞이지 않도록 반드시 teacherId로 서버 쿼리를 제한한다.
  const [sessions, levelTests] = await Promise.all([
    prisma.classSession.findMany({
      where: { teacherId: teacher.id, deletedAt: null },
      include: { student: true, enrollment: true, evaluation: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.levelTest.findMany({
      where: { teacherId: teacher.id },
      include: { student: true },
      orderBy: { id: "desc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">Schedule</h1>
      <TeacherCalendarView
        sessions={sessions.map((s) => ({
          id: s.id,
          scheduledAt: s.scheduledAt,
          durationMin: s.durationMin,
          status: s.status,
          progressNote: s.progressNote,
          studentName: s.student.name,
          classType: s.enrollment.classType,
          classMethod: s.enrollment.classMethod,
          textbookName: s.enrollment.textbookName,
          evaluationId: s.evaluation?.id ?? null,
        }))}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-700">Level Test</h2>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">테스트 날짜</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">레벨</th>
              <th className="px-4 py-3">코멘트</th>
            </tr>
          </thead>
          <tbody>
            {levelTests.map((lt) => (
              <tr key={lt.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{lt.student?.name ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {lt.scheduledTestDate ? fmtDate(lt.scheduledTestDate) : "-"}
                </td>
                <td className="px-4 py-3 text-slate-600">{lt.progressStatus ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {lt.englishLevel ? (ENGLISH_LEVEL_LABEL[lt.englishLevel] ?? lt.englishLevel) : "-"}
                </td>
                <td className="px-4 py-3 text-slate-500">{lt.teacherNote ?? "-"}</td>
              </tr>
            ))}
            {levelTests.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  배정된 레벨테스트가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
