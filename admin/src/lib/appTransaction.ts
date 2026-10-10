// 앱(서버 액션/라우트)에서 재배치·유급휴가·휴강·보충 로직을 트랜잭션으로 돌리는 어댑터.
// lib/prisma.ts의 prisma는 재시도 확장($extends)을 얹은 클라이언트라 표준 TransactionClient와 타입이 구조적으로 어긋난다 —
// 쿼리 API는 같으므로 여기 한 곳에서만 좁은 캐스트를 둔다. 테스트는 PrismaClient.$transaction을 그대로 쓴다.
import { prisma } from "./prisma";
import type { Tx } from "./advisoryLock";

export interface TxOptions {
  timeout?: number;
  maxWait?: number;
}

export function runTx<T>(fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  return prisma.$transaction((tx) => fn(tx as unknown as Tx), { timeout: 60_000, maxWait: 15_000, ...opts });
}
