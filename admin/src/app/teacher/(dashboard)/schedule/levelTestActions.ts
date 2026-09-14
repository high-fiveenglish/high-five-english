"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { TERMINAL_PROGRESS_STATUSES } from "@/lib/levelTestOptions";
import { languageForRegion, translateLevelTestResult } from "@/lib/levelTestTranslation";

const MAX_LENGTH = 4000;

function parseScore(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return value && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// 완성도/이해도는 클라이언트가 계산해 hidden input으로 보내지만, 서버 액션은 폼값을
// 신뢰하지 않고 나머지 네 영역으로 직접 다시 계산한다(다른 필드들과 같은 이유 —
// 클라이언트는 별도 POST 엔드포인트라 조작된 값이 올 수 있다).
function computeCompletion(scores: (number | null)[]): number | null {
  if (scores.some((s) => s == null)) return null;
  const sum = scores.reduce<number>((acc, s) => acc + s!, 0);
  return Math.round(sum / scores.length);
}

export type SaveLevelTestResultState = { error?: string; success?: true };

// Daily Evaluation과 같은 이유로, 관리자가 아니라 담당 강사가 직접 레벨테스트 결과를
// 작성한다 — 관리자 화면(level-tests/[id])의 updateLevelTest와 달리 이 액션은 결과
// 관련 필드만 건드리고, 신청정보/진행상태/담당강사 배정은 그대로 둔다(강사 권한 밖).
export async function saveLevelTestResult(
  levelTestId: number,
  _prevState: SaveLevelTestResultState | undefined,
  formData: FormData,
): Promise<SaveLevelTestResultState> {
  const teacher = await requireTeacher();
  const actor = {
    role: "TEACHER" as const,
    id: teacher.id,
    name: teacher.realName,
    permissions: await resolveRolePermissions("TEACHER"),
  };
  requirePermission(actor, "own_level_tests.update");

  // 폼 자체는 본인 담당 레벨테스트에만 열리지만, 서버 액션은 별도 POST 엔드포인트라
  // 클라이언트를 신뢰하지 않고 여기서도 소유권을 다시 확인한다.
  const levelTest = await prisma.levelTest.findUnique({
    where: { id: levelTestId },
    include: { student: { select: { region: true } } },
  });
  if (!levelTest || levelTest.teacherId !== teacher.id) {
    return { error: "You can only write results for your own level tests." };
  }

  const resultContent = String(formData.get("resultContent") ?? "").trim();
  if (resultContent.length > MAX_LENGTH) {
    return { error: `Exceeded ${MAX_LENGTH} characters. (currently ${resultContent.length})` };
  }
  const recommendedLevel = String(formData.get("recommendedLevel") ?? "").trim();
  const recommendedTextbook = String(formData.get("recommendedTextbook") ?? "").trim();

  const scoreListening = parseScore(formData.get("scoreListening"));
  const scoreSpeakingFluency = parseScore(formData.get("scoreSpeakingFluency"));
  const scoreSpeakingGrammar = parseScore(formData.get("scoreSpeakingGrammar"));
  const scoreVocabulary = parseScore(formData.get("scoreVocabulary"));

  // Daily Evaluation과 같은 이유 — 강사가 결과를 저장하는 행위 자체가 "테스트가
  // 끝났다"는 확정 신호이므로, 아직 관리자가 수업완료/결석/취소로 종결 처리하지 않은
  // 건이면 여기서 자동으로 수업완료로 넘긴다. 이미 종결된 건(관리자가 결석/취소로
  // 처리한 경우 등)은 강사가 뒤늦게 결과만 채워 넣어도 그 종결 상태를 덮어쓰지 않는다.
  const isTerminal = (TERMINAL_PROGRESS_STATUSES as readonly string[]).includes(levelTest.progressStatus ?? "");

  // 결과 내용이 실제로 바뀌었을 때만 번역을 새로 생성한다 — 관리자 쪽 updateLevelTest와
  // 동일한 규칙.
  const targetLang = languageForRegion(levelTest.student?.region ?? null);
  let resultContentTranslated: string | null = levelTest.resultContentTranslated;
  let resultContentTranslatedLang: string | null = levelTest.resultContentTranslatedLang;
  if (resultContent && targetLang) {
    if (resultContent !== levelTest.resultContent || resultContentTranslatedLang !== targetLang.code) {
      resultContentTranslated = await translateLevelTestResult(resultContent, targetLang.name);
      resultContentTranslatedLang = resultContentTranslated ? targetLang.code : null;
    }
  } else {
    resultContentTranslated = null;
    resultContentTranslatedLang = null;
  }

  await prisma.levelTest.update({
    where: { id: levelTestId },
    data: {
      resultContent: resultContent || null,
      recommendedLevel: recommendedLevel || null,
      recommendedTextbook: recommendedTextbook || null,
      scoreListening,
      scoreSpeakingFluency,
      scoreSpeakingGrammar,
      scoreVocabulary,
      scoreCompletion: computeCompletion([scoreListening, scoreSpeakingFluency, scoreSpeakingGrammar, scoreVocabulary]),
      progressStatus: isTerminal ? undefined : "수업완료",
      resultContentTranslated,
      resultContentTranslatedLang,
    },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: levelTestId, description: "레벨테스트 결과 작성(강사)" });

  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  revalidatePath("/level-tests");
  revalidatePath(`/level-tests/${levelTestId}`);
  revalidatePath(`/level-tests/${levelTestId}/result`);
  if (levelTest.studentId) revalidatePath(`/student/level-tests/${levelTestId}`);
  revalidatePath("/student");
  return { success: true as const };
}
