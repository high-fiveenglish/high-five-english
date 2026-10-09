import { notFound } from "next/navigation";
import { requireBackofficeActor } from "./backofficeAuth";
import { prisma } from "./prisma";
import { hasPermission, type Actor } from "./rbac";
import { canAccessInScope, isAgent, type ScopeKind } from "./agentScope";

// (admin) 페이지의 서버 측 접근 검사. 사이드 메뉴 숨김은 편의일 뿐이라, 직접 URL을 입력해도
// 각 페이지가 이 헬퍼로 스스로 권한을 확인해야 한다. 거부는 404로 처리한다 — 권한이 없는
// 사람에게 그 페이지/레코드의 존재 여부를 알려주지 않기 위해서다.
//
// opts.denyAgent: 권한 키를 갖고 있어도 협력사(AGENT) 계정에는 열지 않는 본사 전용 화면
// (강사 관리, 수업 삭제 내역 등 협력사 메뉴 밖의 화면). layout.tsx의 AGENT_NAV_GROUPS가
// 협력사에게 허용된 화면의 전부이고, 협력사는 그 밖으로 나가지 못한다는 기존 정책을 서버에서도
// 똑같이 강제한다.
export interface PageAccessOptions {
  denyAgent?: boolean;
}

export function requirePagePermission(actor: Actor, key: string, opts: PageAccessOptions = {}): void {
  if (opts.denyAgent && isAgent(actor)) notFound();
  if (!hasPermission(actor, key)) notFound();
}

export async function requirePageActor(key: string, opts: PageAccessOptions = {}): Promise<Actor> {
  const actor = await requireBackofficeActor();
  requirePagePermission(actor, key, opts);
  return actor;
}

/** 상세 페이지의 소속 검사 — AGENT가 다른 협력사/본사 직영 레코드의 id를 직접 입력하면 404. */
export async function requirePageInScope(actor: Actor, kind: ScopeKind, id: number): Promise<void> {
  if (!(await canAccessInScope(prisma, actor, kind, id))) notFound();
}

/** ADMIN 전용 화면 — 기존 계정/권한/감사 로그 페이지와 같은 기준. */
export function requirePageAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") notFound();
}
