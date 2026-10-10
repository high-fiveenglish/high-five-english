import { ForbiddenError, type Actor } from "./rbac";

// 협력사(AGENT) 데이터 범위 검사의 단일 기준 — 페이지(직접 URL 입력), 서버 액션, API가 모두
// 이 파일의 판정을 쓴다. 권한 키(requirePermission)는 "이 종류의 작업을 해도 되는가"만
// 답하므로, 대상 레코드가 로그인한 협력사 소속인지(교차 범위/IDOR)는 여기서 따로 확인한다.
//
// 규칙: 본사 계정(ADMIN/MANAGER 등 AGENT가 아닌 역할)은 협력사 범위가 없으므로 항상 통과
// (대상의 존재 여부는 호출한 쪽이 각자 확인한다). AGENT는 대상이 존재하고 그 대상의
// agentId가 자기 협력사일 때만 통과한다 — agentId가 null인 본사 직영 레코드는 어떤
// 협력사도 볼 수 없다. 각 종류가 어느 컬럼으로 소속을 판단하는지는 기존 화면의 스코핑과
// 똑같이 맞췄다(일정표: 학생의 협력사, 수강/레벨테스트/예약: 레코드 자신의 협력사).

// Prisma 클라이언트(확장 클라이언트 포함)와 테스트용 클라이언트가 모두 구조적으로 만족하는 최소 인터페이스.
interface Finder<Select, Row> {
  findUnique(args: { where: { id: number }; select: Select }): PromiseLike<Row | null>;
}
type OwnAgent = { agentId: number | null };
type ViaStudent = { student: OwnAgent };
type ViaStudentSelect = { student: { select: { agentId: true } } };

export interface ScopeDb {
  student: Finder<{ agentId: true }, OwnAgent>;
  enrollment: Finder<{ agentId: true }, OwnAgent>;
  levelTest: Finder<{ agentId: true }, OwnAgent>;
  slotReservation: Finder<{ agentId: true }, OwnAgent>;
  academyClosure: Finder<{ agentId: true }, OwnAgent>;
  classSession: Finder<ViaStudentSelect, ViaStudent>;
  leaveRequest: Finder<ViaStudentSelect, ViaStudent>;
}

export type ScopeKind = "student" | "enrollment" | "levelTest" | "session" | "reservation" | "leaveRequest" | "closure";

const DENIED_MESSAGE: Record<ScopeKind, string> = {
  student: "해당 학생에 접근할 권한이 없습니다.",
  enrollment: "해당 수강 건에 접근할 권한이 없습니다.",
  levelTest: "해당 레벨테스트에 접근할 권한이 없습니다.",
  session: "해당 수업에 접근할 권한이 없습니다.",
  reservation: "해당 예약에 접근할 권한이 없습니다.",
  leaveRequest: "해당 연기 신청에 접근할 권한이 없습니다.",
  closure: "해당 휴강에 접근할 권한이 없습니다.",
};

/** AGENT면 자기 협력사 id, 아니면 undefined(= 범위 제한 없음). 목록 쿼리의 where에 그대로 쓴다. */
export function agentScopeId(actor: Actor): number | undefined {
  return actor.role === "AGENT" ? actor.agentId : undefined;
}

export function isAgent(actor: Actor): actor is Extract<Actor, { role: "AGENT" }> {
  return actor.role === "AGENT";
}

async function ownerAgentId(db: ScopeDb, kind: ScopeKind, id: number): Promise<number | null | undefined> {
  // undefined = 대상이 없음, null = 본사 직영(협력사 없음)
  switch (kind) {
    case "student":
      return (await db.student.findUnique({ where: { id }, select: { agentId: true } }))?.agentId;
    case "enrollment":
      return (await db.enrollment.findUnique({ where: { id }, select: { agentId: true } }))?.agentId;
    case "levelTest":
      return (await db.levelTest.findUnique({ where: { id }, select: { agentId: true } }))?.agentId;
    case "reservation":
      return (await db.slotReservation.findUnique({ where: { id }, select: { agentId: true } }))?.agentId;
    case "closure":
      return (await db.academyClosure.findUnique({ where: { id }, select: { agentId: true } }))?.agentId;
    case "leaveRequest": {
      const row = await db.leaveRequest.findUnique({ where: { id }, select: { student: { select: { agentId: true } } } });
      return row ? row.student.agentId : undefined;
    }
    case "session": {
      const row = await db.classSession.findUnique({ where: { id }, select: { student: { select: { agentId: true } } } });
      return row ? row.student.agentId : undefined;
    }
  }
}

export async function canAccessInScope(db: ScopeDb, actor: Actor, kind: ScopeKind, id: number): Promise<boolean> {
  if (!isAgent(actor)) return true;
  if (!Number.isInteger(id)) return false;
  const owner = await ownerAgentId(db, kind, id);
  return owner !== undefined && owner !== null && owner === actor.agentId;
}

/** 서버 액션/API용 — 범위 밖이면 ForbiddenError. 존재 여부를 알려주지 않도록 "없음"과 "남의 것"을 같은 오류로 돌려준다(AGENT만). */
export async function requireInScope(db: ScopeDb, actor: Actor, kind: ScopeKind, id: number): Promise<void> {
  if (!(await canAccessInScope(db, actor, kind, id))) throw new ForbiddenError(DENIED_MESSAGE[kind]);
}

/** 협력사 계정이 쓸 수 없는 본사 전용 작업(강사·공지·후기·협력사 설정 등) — 권한 키를 AGENT에게 잘못 부여해도 막힌다. */
export function requireHeadquarters(actor: Actor): void {
  if (isAgent(actor)) throw new ForbiddenError();
}
