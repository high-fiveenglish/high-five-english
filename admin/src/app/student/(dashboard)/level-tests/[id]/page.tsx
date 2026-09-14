import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { formatAppDate } from "@/lib/appTime";
import { labelForLangCode } from "@/lib/levelTestTranslation";
import { LevelTestResultView } from "@/components/LevelTestResultView";

export default async function StudentLevelTestResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const student = await requireStudent();
  const { id } = await params;

  // studentId를 where절에 직접 걸어 소유권을 검사한다 — 다른 학생의 레벨테스트 id를
  // 넣으면 결과가 아예 없어(null) notFound()로 이어진다.
  const levelTest = await prisma.levelTest.findFirst({
    where: { id: Number(id), studentId: student.id },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  if (!levelTest) notFound();

  return (
    <div>
      <Link href="/student" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 대시보드로
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">레벨테스트 결과</h1>

      <LevelTestResultView
        data={{
          name: student.name,
          englishName: student.englishName,
          testDate: levelTest.scheduledTestDate ? formatAppDate(levelTest.scheduledTestDate) : null,
          teacherName: levelTest.teacher?.realName ?? null,
          progressStatus: levelTest.progressStatus,
          interestTopic: levelTest.interestTopic,
          recommendedLevel: levelTest.recommendedLevel,
          recommendedTextbook: levelTest.recommendedTextbook,
          scoreListening: levelTest.scoreListening,
          scoreSpeakingFluency: levelTest.scoreSpeakingFluency,
          scoreSpeakingGrammar: levelTest.scoreSpeakingGrammar,
          scoreVocabulary: levelTest.scoreVocabulary,
          scoreCompletion: levelTest.scoreCompletion,
          resultContent: levelTest.resultContent,
          resultContentTranslated: levelTest.resultContentTranslated,
          translatedLangLabel: labelForLangCode(levelTest.resultContentTranslatedLang),
        }}
      />
    </div>
  );
}
