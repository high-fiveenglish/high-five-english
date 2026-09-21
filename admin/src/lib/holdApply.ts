import { prisma } from "@/lib/prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// 관리자가 상태를 "홀드"로 바꾸면 그 수강 건의 예정 수업(SCHEDULED, 아직 지나지 않은
// 것만)을 전부 멈춘다 — 이미 지난 수업은 이미 진행됐거나 결석 처리된 것이라 건드리지
// 않는다. 홀드 시작 시점을 기록해둬야 나중에 며칠 쉬었는지 계산할 수 있다.
export async function applyHold(enrollmentId: number): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.classSession.updateMany({
      where: { enrollmentId, status: "SCHEDULED", scheduledAt: { gte: now }, deletedAt: null },
      data: { status: "HOLD" },
    });
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "HOLDING", holdStartedAt: now },
    });
  });
}

// 홀드 해제 — 학생의 "홀드 해제 요청"(자기 자신이 바로 재개, 승인 대기 없음 —
// leaveApply.ts의 학생 셀프 휴강 신청과 동일한 정책)과 관리자가 상태를 직접 되돌리는
// 경우 양쪽에서 공유한다. 멈춰뒀던 HOLD 수업들을 "쉬었던 일수를 채운 정수 주(週)"만큼
// 뒤로 밀어 원래 요일·시각 그대로 SCHEDULED로 되돌리고, 수강 종료일도 같은 만큼
// 늘린다 — 매주 반복되는 수업 패턴이 깨지지 않도록 일 단위가 아니라 항상 7의 배수로
// 민다(예: 3일만 쉬었어도 다음 수업 요일에 맞춰 최소 1주를 민다).
export async function releaseHold(enrollmentId: number): Promise<{ error?: string }> {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) return { error: "존재하지 않는 수강 건입니다." };
    if (enrollment.status !== "HOLDING" || !enrollment.holdStartedAt) {
      return { error: "현재 홀드 상태가 아닙니다." };
    }

    const heldDays = Math.max(1, Math.ceil((Date.now() - enrollment.holdStartedAt.getTime()) / MS_PER_DAY));
    const shiftDays = Math.ceil(heldDays / 7) * 7;

    const heldSessions = await tx.classSession.findMany({ where: { enrollmentId, status: "HOLD" } });
    for (const s of heldSessions) {
      const newDate = new Date(s.scheduledAt);
      newDate.setUTCDate(newDate.getUTCDate() + shiftDays);
      await tx.classSession.update({ where: { id: s.id }, data: { scheduledAt: newDate, status: "SCHEDULED" } });
    }

    const newEndDate = new Date(enrollment.endDate);
    newEndDate.setUTCDate(newEndDate.getUTCDate() + shiftDays);

    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { status: "ACTIVE", holdStartedAt: null, endDate: newEndDate },
    });

    return {};
  });
}
