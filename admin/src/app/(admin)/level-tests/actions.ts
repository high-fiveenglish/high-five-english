"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { findTeacherScheduleConflict, LEVEL_TEST_DURATION_MIN } from "@/lib/scheduleConflict";
import { parseAppDateTime } from "@/lib/appTime";
import { createLevelTestCore } from "@/lib/levelTestCreate";
import { TERMINAL_PROGRESS_STATUSES } from "@/lib/levelTestOptions";
import { languageForRegion, translateLevelTestResult } from "@/lib/levelTestTranslation";

// 평가 점수 select는 "" | "1".."5"만 보내온다. 미선택(빈 문자열)은 아직 평가하지 않은
// 영역이므로 null(레이더 차트에서 통째로 숨김 처리의 기준)로 저장한다.
function parseScore(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return value && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// 레벨테스트 하나를 보여주는 화면이 관리자 목록/상세/결과미리보기, 강사 일정표,
// 학생 대시보드/결과 페이지로 흩어져 있다 — 어느 액션에서 바뀌든 전부 함께
// 갱신해야 한쪽 화면만 새로고침해도 최신 상태가 보인다.
function revalidateLevelTestViews(id: number, studentId: number | null) {
  revalidatePath("/level-tests");
  revalidatePath(`/level-tests/${id}`);
  revalidatePath(`/level-tests/${id}/result`);
  revalidatePath("/teacher/schedule");
  revalidatePath("/teacher");
  if (studentId) revalidatePath(`/student/level-tests/${id}`);
  revalidatePath("/student");
}

// 완성도/이해도는 폼에서 직접 받지 않는다 — 나머지 네 영역의 평균을 서버에서 계산한다
// (강사용 레벨테스트 결과 작성 화면과 동일한 규칙).
function computeCompletion(scores: (number | null)[]): number | null {
  if (scores.some((s) => s == null)) return null;
  const sum = scores.reduce<number>((acc, s) => acc + s!, 0);
  return Math.round(sum / scores.length);
}

// 레벨테스트관리 목록의 "+ 레벨테스트 신청 등록"용 — 학생관리의 특정 학생 페이지에서
// 등록하는 것과 같은 로직(createLevelTestCore)을 쓴다. 다른 점은 studentId를 학생
// 페이지 params가 아니라 이 폼 자체의 select에서 받는다는 것과, 등록 후 곧바로 그
// 신청 건의 상세/확정 화면으로 이동시켜 이어서 일정을 확정할 수 있게 하는 것뿐이다.
export async function createLevelTest(_prevState: { error?: string } | undefined, formData: FormData) {
  const studentId = Number(formData.get("studentId"));
  if (!studentId) {
    return { error: "학생을 선택해주세요." };
  }

  const result = await createLevelTestCore(studentId, formData);
  if (result.error) return { error: result.error };

  revalidatePath("/students");
  revalidatePath("/level-tests");
  redirect(`/level-tests/${result.levelTestId}`);
}

// 신청 당시 입력값(연락처 등)만 고치는 저장 액션 — 담당강사/일시/진행상태는 여기서
// 건드리지 않는다(그건 confirmLevelTestSchedule의 몫). studentId가 있는 정식 신청
// 건은 연락처를 학생 프로필에도 반영한다(createLevelTestForStudent와 동일한 정책) —
// 리드(studentId 없음) 건은 그런 프로필이 없으므로 LevelTest 자체에만 저장한다.
export async function updateLevelTest(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");

  const levelTest = await prisma.levelTest.findUnique({ where: { id }, include: { student: { select: { region: true } } } });
  if (!levelTest) {
    return { error: "레벨테스트 신청을 찾을 수 없습니다." };
  }

  const classMethod = String(formData.get("classMethod") ?? "").trim();
  const mobilePhone = String(formData.get("mobilePhone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const teamsId = String(formData.get("teamsId") ?? "").trim();
  const kakaoId = String(formData.get("kakaoId") ?? "").trim();
  const wechatId = String(formData.get("wechatId") ?? "").trim();
  const englishLevel = String(formData.get("englishLevel") ?? "").trim();
  const ageGroup = String(formData.get("ageGroup") ?? "").trim();
  const interestTopic = String(formData.get("interestTopic") ?? "").trim();
  const teacherNote = String(formData.get("teacherNote") ?? "").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  const resultContent = String(formData.get("resultContent") ?? "").trim();
  const recommendedLevel = String(formData.get("recommendedLevel") ?? "").trim();
  const recommendedTextbook = String(formData.get("recommendedTextbook") ?? "").trim();
  const scoreListening = parseScore(formData.get("scoreListening"));
  const scoreSpeakingFluency = parseScore(formData.get("scoreSpeakingFluency"));
  const scoreSpeakingGrammar = parseScore(formData.get("scoreSpeakingGrammar"));
  const scoreVocabulary = parseScore(formData.get("scoreVocabulary"));
  const scoreCompletion = computeCompletion([scoreListening, scoreSpeakingFluency, scoreSpeakingGrammar, scoreVocabulary]);

  // 결과 내용이 실제로 바뀌었을 때만 번역을 새로 생성한다 — 그 외 필드만 고친
  // 저장에서까지 매번 번역 API를 부르면 낭비다. 학생 거주지역이 영어권이거나
  // 미입력이면 번역 자체가 필요 없다(languageForRegion이 null 반환).
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

  if (levelTest.studentId) {
    await prisma.student.update({
      where: { id: levelTest.studentId },
      data: {
        mobilePhone: mobilePhone || null,
        email: email || null,
        teamsId: teamsId || null,
        kakaoId: kakaoId || null,
        wechatId: wechatId || null,
        preferredClassMethod: classMethod || null,
      },
    });
  }

  await prisma.levelTest.update({
    where: { id },
    data: {
      classMethod: classMethod || null,
      englishLevel: englishLevel || null,
      ageGroup: ageGroup || null,
      interestTopic: interestTopic || null,
      teacherNote: teacherNote || null,
      adminNote: adminNote || null,
      resultContent: resultContent || null,
      recommendedLevel: recommendedLevel || null,
      recommendedTextbook: recommendedTextbook || null,
      scoreListening,
      scoreSpeakingFluency,
      scoreSpeakingGrammar,
      scoreVocabulary,
      scoreCompletion,
      resultContentTranslated,
      resultContentTranslatedLang,
    },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: id, description: "레벨테스트 신청정보 저장" });

  revalidateLevelTestViews(id, levelTest.studentId);
  return {};
}

// "수업 확정" 전용 액션 — 담당강사·레벨테스트 일시·진행상태(수업확정) 세 가지를 한
// 번에 같이 적용한다. 이 셋은 개별적으로 고르는 값이 아니라 "확정한다"는 하나의
// 행위의 결과이기 때문에 별도 라디오/드롭다운을 두지 않고 이 액션 하나로 묶는다.
export async function confirmLevelTestSchedule(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");

  const testDate = String(formData.get("testDate") ?? "");
  const testTime = String(formData.get("testTime") ?? "");
  const teacherIdRaw = String(formData.get("teacherId") ?? "");
  const teacherId = teacherIdRaw ? Number(teacherIdRaw) : null;

  if (!testDate || !teacherId) {
    return { error: "날짜와 담당 강사를 모두 선택해야 수업을 확정할 수 있습니다." };
  }

  const scheduledDate = parseAppDateTime(`${testDate}T${testTime || "00:00"}`);

  const conflict = await findTeacherScheduleConflict({
    teacherId,
    start: scheduledDate,
    durationMin: LEVEL_TEST_DURATION_MIN,
    excludeLevelTestId: id,
  });
  if (conflict) {
    return { error: `해당 강사는 같은 시간에 이미 다른 일정이 있습니다: ${conflict.label}` };
  }

  const updated = await prisma.levelTest.update({
    where: { id },
    data: {
      teacherId,
      scheduledTestDate: scheduledDate,
      scheduledClassDatetime: scheduledDate,
      progressStatus: "수업확정",
    },
  });
  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "LevelTest",
    targetId: id,
    description: `수업 확정: 강사 ${teacherId}, 일시 ${testDate} ${testTime || "00:00"}`,
  });

  revalidateLevelTestViews(id, updated.studentId);
  return {};
}

// 확정을 취소하고 접수 상태로 되돌린다 — 담당강사·확정수업일자를 비우되, 학생이
// 원래 신청했던 희망 일시(scheduledTestDate)는 그대로 남겨 다시 확정 작업을 이어갈
// 수 있게 한다.
export async function revertLevelTestConfirmation(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");
  const updated = await prisma.levelTest.update({
    where: { id },
    data: { teacherId: null, scheduledClassDatetime: null, progressStatus: "접수" },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: id, description: "수업 확정 취소" });
  revalidateLevelTestViews(id, updated.studentId);
}

// 확정된 수업이 끝난 뒤의 최종 결과 처리 — 수업완료/결석/취소. 강사 배정·일시와
// 달리 이건 다시 되돌릴 필요가 거의 없는 종결 처리라 별도 확인 없이 바로 적용한다.
export async function setLevelTestOutcome(id: number, outcome: (typeof TERMINAL_PROGRESS_STATUSES)[number]) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");
  const updated = await prisma.levelTest.update({ where: { id }, data: { progressStatus: outcome } });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: id, description: `진행상태 변경: ${outcome}` });
  revalidateLevelTestViews(id, updated.studentId);
}

// 수업완료/결석/취소로 잘못 처리했을 때 "수업확정" 상태로만 되돌린다(담당강사·확정
// 일시는 그대로 유지 — 이미 확정했던 값이라 다시 고를 필요가 없다). 아예 처음부터
// 다시 하려면 revertLevelTestConfirmation을 쓴다.
export async function reopenLevelTestConfirmation(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.update");
  const updated = await prisma.levelTest.update({ where: { id }, data: { progressStatus: "수업확정" } });
  await logAudit({ actor, action: "UPDATE", targetType: "LevelTest", targetId: id, description: "수업확정 상태로 되돌림" });
  revalidateLevelTestViews(id, updated.studentId);
}

export async function deleteLevelTest(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "level_tests.delete");
  await prisma.levelTest.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "LevelTest", targetId: id });
  revalidatePath("/level-tests");
}
