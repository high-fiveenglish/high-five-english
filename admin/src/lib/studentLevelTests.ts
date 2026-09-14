// 마케팅 사이트(Vite) "내 강의실 > 레벨테스트신청/레벨테스트결과" 탭이 읽는 공용
// 로직 — 학생의 레벨테스트 이력 조회와, 재신청 가능 여부(진행 중인 신청이 있는지 /
// 최근에 실제로 진행된 테스트로부터 6개월이 지났는지) 판정을 한 곳에 모은다.
// api/public/level-test/route.ts(신청 접수)와 api/public/level-test/mine/route.ts
// (조회) 양쪽에서 이 파일을 쓴다.
import { prisma } from "./prisma";
import { formatAppDate, formatAppDateTime } from "./appTime";
import { TEACHER_SUMMARY_SELECT } from "./teacherSelect";
import { TERMINAL_PROGRESS_STATUSES } from "./levelTestOptions";

// 재신청 대기 기간 — "기존 레벨테스트가 실제로 진행된 경우, 그 이후 6개월이 지나야
// 다시 신청할 수 있다"는 정책. 결석/취소로 끝난 건은 실제로 진행된 게 아니므로 이
// 대기 기간을 적용하지 않는다(바로 재신청 가능) — 아래 계산도 progressStatus가
// "수업완료"인 가장 최근 건만 본다.
const COOLDOWN_MONTHS = 6;

function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export type LevelTestEligibility =
  | { eligible: true }
  | { eligible: false; reason: "pending"; sinceLevelTestId: number }
  | { eligible: false; reason: "cooldown"; eligibleAt: string; lastConductedAt: string };

export async function getLevelTestEligibility(studentId: number): Promise<LevelTestEligibility> {
  const pending = await prisma.levelTest.findFirst({
    where: { studentId, progressStatus: { notIn: [...TERMINAL_PROGRESS_STATUSES] } },
    orderBy: { id: "desc" },
  });
  if (pending) return { eligible: false, reason: "pending", sinceLevelTestId: pending.id };

  const lastConducted = await prisma.levelTest.findFirst({
    where: { studentId, progressStatus: "수업완료", scheduledTestDate: { not: null } },
    orderBy: { scheduledTestDate: "desc" },
  });
  if (lastConducted?.scheduledTestDate) {
    const eligibleAt = addMonthsUtc(lastConducted.scheduledTestDate, COOLDOWN_MONTHS);
    if (Date.now() < eligibleAt.getTime()) {
      return {
        eligible: false,
        reason: "cooldown",
        eligibleAt: formatAppDate(eligibleAt),
        lastConductedAt: formatAppDate(lastConducted.scheduledTestDate),
      };
    }
  }

  return { eligible: true };
}

export type StudentLevelTestRow = {
  id: number;
  appliedAt: string;
  scheduledTestDate: string | null;
  progressStatus: string;
  teacherName: string | null;
  recommendedLevel: string | null;
  recommendedTextbook: string | null;
  resultContent: string | null;
  resultContentTranslated: string | null;
  resultContentTranslatedLang: string | null;
  // 다섯 영역 모두 채점된 경우에만 값이 들어간다(하나라도 비어 있으면 통째로 null) —
  // 레이더 차트가 부분 점수로 그려지는 것을 막기 위함.
  scores: {
    listening: number;
    speakingFluency: number;
    speakingGrammar: number;
    vocabulary: number;
    completion: number;
  } | null;
};

export async function getStudentLevelTests(studentId: number): Promise<StudentLevelTestRow[]> {
  const tests = await prisma.levelTest.findMany({
    where: { studentId },
    orderBy: { id: "desc" },
    include: { teacher: { select: TEACHER_SUMMARY_SELECT } },
  });

  return tests.map((t) => {
    const hasScores =
      t.scoreListening != null &&
      t.scoreSpeakingFluency != null &&
      t.scoreSpeakingGrammar != null &&
      t.scoreVocabulary != null &&
      t.scoreCompletion != null;

    return {
      id: t.id,
      appliedAt: formatAppDateTime(t.appliedAt),
      scheduledTestDate: t.scheduledTestDate ? formatAppDateTime(t.scheduledTestDate) : null,
      progressStatus: t.progressStatus ?? "접수",
      teacherName: t.teacher?.realName ?? null,
      recommendedLevel: t.recommendedLevel,
      recommendedTextbook: t.recommendedTextbook,
      resultContent: t.resultContent,
      resultContentTranslated: t.resultContentTranslated,
      resultContentTranslatedLang: t.resultContentTranslatedLang,
      scores: hasScores
        ? {
            listening: t.scoreListening!,
            speakingFluency: t.scoreSpeakingFluency!,
            speakingGrammar: t.scoreSpeakingGrammar!,
            vocabulary: t.scoreVocabulary!,
            completion: t.scoreCompletion!,
          }
        : null,
    };
  });
}
