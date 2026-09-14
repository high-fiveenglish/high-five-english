import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { formatAppDate } from "@/lib/appTime";
import { labelForLangCode } from "@/lib/levelTestTranslation";
import { LevelTestResultView } from "@/components/LevelTestResultView";

// 관리자가 "확인"을 눌렀을 때 보는 화면 — 학생이 /student/level-tests/[id]에서 보는
// 화면과 동일한 레이아웃/서식으로 결과를 보여준다(읽기 전용). 내용을 고치려면 "수정"
// 버튼으로 목록에서 바로 편집 화면(레벨테스트 결과 섹션)으로 이동한다.
export default async function LevelTestResultPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireBackofficeActor();
  const { id } = await params;
  const levelTestId = Number(id);

  const levelTest = await prisma.levelTest.findUnique({
    where: { id: levelTestId },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  if (!levelTest) notFound();

  const name = levelTest.student?.name ?? levelTest.leadStudentEnglishName ?? levelTest.leadContactName ?? "-";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/level-tests" className="text-xs font-semibold text-slate-500 hover:underline">
          ← 레벨테스트관리로
        </Link>
        <Link
          href={`/level-tests/${levelTest.id}#result`}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          수정하기
        </Link>
      </div>

      <p className="mb-1 text-xs font-semibold text-blue-600">학생에게 보이는 화면 미리보기</p>
      <h1 className="mb-6 text-xl font-bold text-slate-900">레벨테스트 결과</h1>

      <LevelTestResultView
        data={{
          name,
          englishName: levelTest.student?.englishName ?? levelTest.leadStudentEnglishName ?? null,
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
