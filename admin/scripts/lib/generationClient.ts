// 수업 생성 CLI/통합 테스트가 쓰는 Prisma 클라이언트 생성기. 앱의 싱글턴(src/lib/prisma.ts)과 별개로, 명시한 URL로만 연결한다.
// ?schema=<name> 쿼리가 있으면 그 PostgreSQL 스키마를 쓴다(통합 테스트가 격리된 스키마에서 돌 수 있게). 연결 문자열은 출력하지 않는다.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export interface ParsedDbUrl {
  connectionString: string;
  schema: string | null;
  host: string;
  database: string;
}

export function parseDbUrl(raw: string): ParsedDbUrl {
  const u = new URL(raw);
  const schema = u.searchParams.get("schema");
  u.searchParams.delete("schema");
  return { connectionString: u.toString(), schema, host: u.hostname, database: u.pathname.replace(/^\//, "") };
}

export function createGenerationClient(raw: string, opts: { max?: number } = {}): PrismaClient {
  const parsed = parseDbUrl(raw);
  const adapter = new PrismaPg({ connectionString: parsed.connectionString, max: opts.max ?? 4 }, parsed.schema ? { schema: parsed.schema } : undefined);
  return new PrismaClient({ adapter });
}
