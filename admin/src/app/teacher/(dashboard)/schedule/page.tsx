import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { TeacherCalendarView } from "./TeacherCalendarView";

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
      where: { teacherId: teacher.id, scheduledTestDate: { not: null } },
      include: { student: true },
      orderBy: { scheduledTestDate: "asc" },
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
          studentEnglishName: s.enrollment.studentEnglishName ?? s.student.englishName,
          classMethod: s.enrollment.classMethod,
          textbookName: s.enrollment.textbookName,
          evaluationId: s.evaluation?.id ?? null,
          evaluationContent: s.evaluation?.content ?? null,
          isSupplement: s.isSupplement,
        }))}
        levelTests={levelTests.map((lt) => ({
          id: lt.id,
          // 위 쿼리에서 scheduledTestDate: { not: null }로 걸렀으므로 non-null 단언이 안전하다.
          scheduledTestDate: lt.scheduledTestDate!,
          studentName: lt.student?.name ?? "Unassigned",
          studentEnglishName: lt.student?.englishName ?? null,
          classMethod: lt.classMethod,
          englishLevel: lt.englishLevel,
          progressStatus: lt.progressStatus,
          teacherNote: lt.teacherNote,
          resultContent: lt.resultContent,
          recommendedLevel: lt.recommendedLevel,
          recommendedTextbook: lt.recommendedTextbook,
          scoreListening: lt.scoreListening,
          scoreSpeakingFluency: lt.scoreSpeakingFluency,
          scoreSpeakingGrammar: lt.scoreSpeakingGrammar,
          scoreVocabulary: lt.scoreVocabulary,
          scoreCompletion: lt.scoreCompletion,
        }))}
        teacherMeetingInfo={{
          teamsUrl: teacher.teamsUrl,
          zoomUrl: teacher.zoomUrl,
          tencentUrl: teacher.tencentUrl,
        }}
      />
    </div>
  );
}
