import { appDayStart } from "@/lib/appTime";
import type { Prisma } from "@/generated/prisma/client";

export type EnrollmentFilterKey =
  | "all"
  | "applied"
  | "active"
  | "completed"
  | "ending3"
  | "ending7"
  | "ended3ago"
  | "ended1ago"
  | "endedToday"
  | "paymentFailed";

export const FILTER_TABS: { key: EnrollmentFilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "applied", label: "접수내역(미등록)" },
  { key: "active", label: "진행중" },
  { key: "completed", label: "종료됨" },
  { key: "ending3", label: "3일이내 종료예정" },
  { key: "ending7", label: "7일이내 종료예정" },
  { key: "ended3ago", label: "3일전 종료" },
  { key: "ended1ago", label: "1일전 종료" },
  { key: "endedToday", label: "금일 종료" },
  { key: "paymentFailed", label: "결제 실패" },
];

// "오늘"은 서버 프로세스의 로컬 시간이 아니라 Asia/Seoul 기준으로 계산한다.
function dayStart(offsetDays: number): Date {
  return appDayStart(new Date(), offsetDays);
}

export function buildEnrollmentWhere(filter: string | undefined): Prisma.EnrollmentWhereInput {
  switch (filter as EnrollmentFilterKey | undefined) {
    case "applied":
      return { status: "APPLIED" };
    case "active":
      return { status: "ACTIVE" };
    case "completed":
      return { status: "COMPLETED" };
    case "ending3":
      return { endDate: { gte: dayStart(0), lt: dayStart(4) } };
    case "ending7":
      return { endDate: { gte: dayStart(0), lt: dayStart(8) } };
    case "ended3ago":
      return { endDate: { gte: dayStart(-3), lt: dayStart(-2) } };
    case "ended1ago":
      return { endDate: { gte: dayStart(-1), lt: dayStart(0) } };
    case "endedToday":
      return { endDate: { gte: dayStart(0), lt: dayStart(1) } };
    case "paymentFailed":
      return { paymentStatus: "FAILED" };
    default:
      return {};
  }
}
