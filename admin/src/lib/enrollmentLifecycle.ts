import { prisma } from "./prisma";
import { appDayStart } from "./appTime";

// 예약된 백그라운드 잡이 없는 환경이라, 수업종료일이 지난 수강 건을 관리자가 수동으로
// "종료" 처리해주지 않으면 영영 ACTIVE로 남는다 — 레거시 사이트에서 13,000건 넘게
// 이렇게 방치됐던 문제를 되풀이하지 않기 위해, 트래픽이 있는 조회 경로(관리자 수강내역
// 목록, 대시보드, 학생/강사가 보는 공개 API)에서 가볍게 호출해 매번 최신 상태로 맞춘다.
// 종료일이 "오늘"인 건은 아직 당일 수업이 남아있을 수 있어 하루 더 기다렸다가(내일부터)
// 넘긴다 — filters.ts의 "금일 종료" 탭과 동일한 경계.
export async function closeExpiredEnrollments(): Promise<number> {
  const result = await prisma.enrollment.updateMany({
    where: {
      status: { in: ["APPLIED", "PAID", "ACTIVE", "HOLDING"] },
      endDate: { lt: appDayStart() },
    },
    data: { status: "COMPLETED", holdStartedAt: null },
  });
  return result.count;
}
