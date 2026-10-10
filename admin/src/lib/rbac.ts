import { prisma } from "./prisma";
import type { AuditAction, RoleName } from "../generated/prisma/client";

// ADMIN은 permissions 배열 자체가 없다 — requirePermission()이 role만 보고 항상
// 통과시키므로, 권한 테이블을 잘못 편집해도 ADMIN이 잠길 수 없다(설계 요구사항).
export type Actor =
  | { role: "ADMIN"; id: number; name: string }
  | { role: "MANAGER" | "TEACHER" | "STUDENT"; id: number; name: string; permissions: string[] }
  // AGENT는 항상 agentId를 갖는다 — 모든 데이터 조회/생성 액션이 이 값으로 스코핑한다.
  | { role: "AGENT"; id: number; name: string; permissions: string[]; agentId: number };

export async function resolveRolePermissions(role: Exclude<RoleName, "ADMIN">): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permission: { select: { key: true } } },
  });
  return rows.map((r) => r.permission.key);
}

export class ForbiddenError extends Error {
  constructor(message = "이 작업을 수행할 권한이 없습니다.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// 권한 판정의 단일 기준 — requirePermission(서버 액션/API)과 페이지 접근 검사, 테스트가
// 모두 이 함수를 쓴다. ADMIN은 항상 true, 그 외에는 역할 권한 목록에 키가 있어야 한다.
export function hasPermission(actor: Actor, key: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.permissions.includes(key);
}

export function requirePermission(actor: Actor, key: string): void {
  if (hasPermission(actor, key)) return;
  throw new ForbiddenError();
}

export async function logAudit(params: {
  actor: Pick<Actor, "role" | "id" | "name"> | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string | number;
  description?: string;
}): Promise<void> {
  const { actor, action, targetType, targetId, description } = params;
  await prisma.auditLog.create({
    data: {
      actorRole: actor?.role ?? null,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      action,
      targetType,
      targetId: targetId !== undefined ? String(targetId) : undefined,
      description,
    },
  });
}
