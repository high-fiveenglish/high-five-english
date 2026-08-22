import type { StudentGrade, StudentStatus } from "@/generated/prisma/client";

// 회원등급/수강상태 라벨의 단일 출처 — 목록·수정폼·생성폼이 모두 여기를 참조한다.
// 등급 자체는 Prisma의 StudentGrade enum이 정의하므로 여기서는 표시 문자열만 매핑한다.
export const GRADE_OPTIONS: { value: StudentGrade; label: string }[] = [
  { value: "GENERAL", label: "일반회원" },
  { value: "BRANCH", label: "지점" },
  { value: "AGENT", label: "협력사" },
  { value: "ADMIN", label: "관리자" },
];

export const STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: "ACTIVE", label: "활동중" },
  { value: "HOLDING", label: "홀드" },
  { value: "EXPIRED", label: "만료" },
];

export const GRADE_LABEL: Record<string, string> = Object.fromEntries(
  GRADE_OPTIONS.map((o) => [o.value, o.label]),
);

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);
