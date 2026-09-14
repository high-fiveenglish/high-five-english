// 강사 포털(teacher.*) 전용 표시 라벨. 강사는 한글을 읽지 못할 수 있으므로 이 포털의
// 모든 고정 UI 텍스트는 영어로 표기하되, 학생/강사 실명(고유명사)만 예외로 한글을 유지한다.
// admin/학생 포털에서 재사용하는 공유 상수(levelTestOptions.ts 등)는 건드리지 않고,
// 여기서만 쓰는 영어 번역을 별도로 둔다.

import type { SessionStatus } from "@/generated/prisma/client";

export const SESSION_STATUS_LABEL_EN: Record<SessionStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  MAKEUP_NEEDED: "Makeup Needed",
  LEAVE: "Hold",
};

// 레벨테스트 진행상태(LevelTest.progressStatus, levelTestOptions.ts 기준: 접수 →
// 수업확정 → 수업완료/결석/취소) — 데이터는 한글로 저장되므로 표시만 영어로 번역한다.
export const LEVEL_TEST_PROGRESS_LABEL_EN: Record<string, string> = {
  접수: "Applied",
  수업확정: "Confirmed",
  수업완료: "Completed",
  결석: "Absent",
  취소: "Cancelled",
};

// 레벨테스트 영어 레벨 설명(levelTestOptions.ts)은 학생이 직접 고르는 한글 문구라
// admin/학생 화면과 공유된다 — 강사 화면에서만 쓸 짧은 영어 라벨을 별도로 둔다.
export const ENGLISH_LEVEL_LABEL_EN: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// 강사가 학생의 한글 이름을 읽지 못하므로, 목록/상세 어디서든 영어 이름을 함께 표기한다.
export function studentDisplayName(koreanName: string, englishName?: string | null): string {
  return englishName ? `${koreanName} (${englishName})` : koreanName;
}
