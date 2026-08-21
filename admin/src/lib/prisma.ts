import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // 이 환경에서는 동시에 여러 커넥션을 열면(Promise.all 등) 첫 번째만 성공하고 나머지가
  // 타임아웃되는 문제가 있었다(Neon 무료 컴퓨트 커넥션 제한 또는 로컬 네트워크 제약으로
  // 추정). 풀을 커넥션 1개로 고정해 모든 쿼리가 순차적으로 하나의 연결을 재사용하도록
  // 강제하면 이 문제를 완전히 피할 수 있다 — 이 관리자 도구의 트래픽 규모에서는 충분하다.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

const basePrisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

function isConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("Connection terminated") ||
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("connection timeout") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT")
  );
}

const MAX_ATTEMPTS = 3;

// Neon 무료 컴퓨트는 일정 시간 유휴 상태면 슬립되고, 깨어나는 데 걸리는 시간이 매번
// 달라 재연결 시도가 몇 차례 타임아웃되기도 한다(재시도하면 결국 성공함). 모든 쿼리에
// 최대 2회 재시도를 걸어 이 콜드 스타트 지연을 흡수한다.
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            if (!isConnectionError(err) || attempt === MAX_ATTEMPTS) throw err;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        throw new Error("unreachable");
      },
    },
  },
});
