import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // 예전엔 DATABASE_URL이 Neon의 직접(non-pooled) 엔드포인트였고, 그 상태에서 동시에
  // 여러 커넥션을 열면(Promise.all 등) 첫 번째만 성공하고 나머지가 타임아웃되는 문제가
  // 있어 풀을 1개로 고정해뒀었다. 하지만 이 admin 서버 하나가 관리자 페이지 자체 트래픽과
  // 마케팅 사이트가 호출하는 /api/public/* 공개 API 트래픽을 동시에 처리하다 보니, 풀이
  // 1개뿐이면 둘이 서로를 막아 세워(예: 마케팅 사이트가 강사 목록을 조회하는 동안 관리자
  // 페이지 전체가 멈춰 보임) 체감 버퍼링이 심했다. DATABASE_URL을 Neon의 풀드(PgBouncer)
  // 엔드포인트로 바꾼 뒤(.env 참고)부터는 여러 커넥션을 동시에 열어도 PgBouncer가 안전하게
  // 처리하므로, 풀을 5개로 늘려 관리자 화면과 공개 API가 서로를 기다리지 않게 한다.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 5,
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
