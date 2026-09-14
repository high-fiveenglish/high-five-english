import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { LevelTestEditForm } from "./LevelTestEditForm";

export default async function LevelTestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const levelTestId = Number(id);

  const levelTest = await prisma.levelTest.findUnique({
    where: { id: levelTestId },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  if (!levelTest) notFound();

  return (
    <div>
      <LevelTestEditForm
        levelTest={{
          id: levelTest.id,
          isLead: !levelTest.studentId,
          studentId: levelTest.studentId,
          loginId: levelTest.student?.loginId ?? null,
          name: levelTest.student?.name ?? levelTest.leadStudentEnglishName ?? levelTest.leadContactName ?? "-",
          englishName: levelTest.student?.englishName ?? levelTest.leadStudentEnglishName ?? null,
          appliedAt: levelTest.appliedAt.toISOString(),
          scheduledTestDate: levelTest.scheduledTestDate?.toISOString() ?? null,
          mobilePhone: levelTest.student?.mobilePhone ?? levelTest.leadContactPhone ?? "",
          email: levelTest.student?.email ?? "",
          teamsId: levelTest.student?.teamsId ?? "",
          kakaoId: levelTest.student?.kakaoId ?? "",
          wechatId: levelTest.student?.wechatId ?? "",
          classMethod: levelTest.classMethod ?? levelTest.leadMeetingPlatform ?? "",
          englishLevel: levelTest.englishLevel ?? "",
          ageGroup: levelTest.ageGroup ?? "",
          interestTopic: levelTest.interestTopic ?? "",
          teacherNote: levelTest.teacherNote ?? "",
          adminNote: levelTest.adminNote ?? "",
          resultContent: levelTest.resultContent ?? "",
          recommendedLevel: levelTest.recommendedLevel ?? "",
          recommendedTextbook: levelTest.recommendedTextbook ?? "",
          scoreListening: levelTest.scoreListening,
          scoreSpeakingFluency: levelTest.scoreSpeakingFluency,
          scoreSpeakingGrammar: levelTest.scoreSpeakingGrammar,
          scoreVocabulary: levelTest.scoreVocabulary,
          scoreCompletion: levelTest.scoreCompletion,
          progressStatus: levelTest.progressStatus ?? "접수",
          teacherId: levelTest.teacherId,
          teacherName: levelTest.teacher?.realName ?? null,
        }}
      />
    </div>
  );
}
