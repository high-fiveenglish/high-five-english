// 트랜잭션 단위 advisory lock 헬퍼 — 연기/휴강/유급휴가/보충수업이 같은 수강·강사·학생을 동시에 건드려도 직렬화되도록 한다.
//
// 락 순서는 전역 규칙으로 고정한다: 강사 → 수강 → 학생(같은 종류끼리는 id 오름차순). 수업 생성 실행기(sessionGeneration.ts)도
// "강사 → 수강" 순서이고 같은 네임스페이스 값을 쓰므로, 생성 실행과 연기가 서로를 기다릴 뿐 교착되지 않는다.
// 한 트랜잭션에서 여러 건을 처리하는 호출자(전체 휴강, 유급휴가 승인)는 필요한 키를 한꺼번에 lockAll로 먼저 잡는다.
import type { Prisma } from "../generated/prisma/client";

export type Tx = Prisma.TransactionClient;

// sessionGeneration.ts의 LOCK_NS_ENROLLMENT/LOCK_NS_TEACHER와 같은 값 — 같은 대상은 같은 락이다.
export const LOCK_NS_ENROLLMENT = 7001;
export const LOCK_NS_TEACHER = 7002;
export const LOCK_NS_STUDENT = 7004;

export interface LockTargets {
  teacherIds?: Iterable<number>;
  enrollmentIds?: Iterable<number>;
  studentIds?: Iterable<number>;
}

function sortedUnique(ids: Iterable<number> | undefined): number[] {
  return [...new Set(ids ?? [])].sort((a, b) => a - b);
}

/** 전역 순서(강사 → 수강 → 학생)로 transaction-level advisory lock을 잡는다. 이미 잡은 락을 다시 잡아도 안전하다(재진입). */
export async function lockAll(tx: Tx, targets: LockTargets): Promise<void> {
  for (const id of sortedUnique(targets.teacherIds)) {
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_TEACHER}::int, ${id}::int)) AS t`;
  }
  for (const id of sortedUnique(targets.enrollmentIds)) {
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_ENROLLMENT}::int, ${id}::int)) AS t`;
  }
  for (const id of sortedUnique(targets.studentIds)) {
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_STUDENT}::int, ${id}::int)) AS t`;
  }
}

export const LOCK_NS_CLOSURE_DAY = 7006;

/** 같은 날짜의 학원 휴강을 동시에 두 번 등록/되돌리지 못하게 날짜 단위로 잠근다(KST 날짜 → 에포크 일수). */
export async function lockClosureDay(tx: Tx, dayStart: Date): Promise<void> {
  const dayNumber = Math.floor(dayStart.getTime() / 86_400_000);
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(${LOCK_NS_CLOSURE_DAY}::int, ${dayNumber}::int)) AS t`;
}
