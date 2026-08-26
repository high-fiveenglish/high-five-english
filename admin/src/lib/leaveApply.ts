import { prisma } from "@/lib/prisma";

// lib/prisma.ts의 `prisma`는 재시도 로직을 얹기 위해 $extends()로 감싼 클라이언트라
// 표준 Prisma.TransactionClient 타입과 구조적으로 맞지 않는다 — $transaction()의
// 콜백 파라미터 타입을 그대로 추출해서 쓴다.
type ExtendedTransactionClient = Parameters<
  Extract<Parameters<typeof prisma.$transaction>[0], (...args: never[]) => unknown>
>[0];

// Student 셀프 신청 / Admin 즉시등록 / Teacher Hold 승인, 3곳 모두 "휴강을 실제로
// 적용한다"는 동일한 두 단계(ClassSession→LEAVE, Enrollment.endDate 연장)를
// 공유한다 — 로직이 갈라지지 않도록 한 곳에 모은다. LeaveRequest 자체의
// 생성/수정은 호출부마다 다르므로 호출부의 $transaction 콜백 안에서 이 함수와
// 함께 실행한다.
export async function applyClassLeave(
  tx: ExtendedTransactionClient,
  params: { classSessionId: number; enrollmentId: number; currentEndDate: Date; extendedDays: number },
): Promise<void> {
  const newEndDate = new Date(params.currentEndDate);
  newEndDate.setDate(newEndDate.getDate() + params.extendedDays);

  await tx.classSession.update({ where: { id: params.classSessionId }, data: { status: "LEAVE" } });
  await tx.enrollment.update({ where: { id: params.enrollmentId }, data: { endDate: newEndDate } });
}
