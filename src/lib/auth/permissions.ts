// Server-side-style authorization checks for the mock service layer. Every sensitive
// service function calls one of these as its FIRST statement and returns immediately on
// failure — this is what stands in for "checked at the API level" in a project with no
// real backend yet: calling the function directly (not just hiding a menu item) is what's
// actually blocked.
import type { Actor, PermissionKey, Role, ServiceResult } from "./types";
import { errResult, okResult } from "./types";

export function requireRole(actor: Actor | null, allowed: Role[]): ServiceResult<void> {
  if (!actor) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (!allowed.includes(actor.role)) {
    return errResult("FORBIDDEN_ROLE", "이 작업을 수행할 권한이 없습니다.");
  }
  return okResult(undefined);
}

/** general_manager always passes. general_admin passes only if `key` was granted to them. */
export function requirePermission(actor: Actor | null, key: PermissionKey): ServiceResult<void> {
  if (!actor) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (actor.role === "general_manager") return okResult(undefined);
  if (actor.role === "general_admin" && actor.permissions.includes(key)) return okResult(undefined);
  return errResult("FORBIDDEN_PERMISSION", "이 기능에 대한 권한이 없습니다.");
}

/** Passes for the matching student themself, general_manager, or a general_admin with
 * the "students" permission. Blocks a student from reaching another student's data even
 * if they know the id (e.g. a guessed lessonId/evaluationId in a URL). */
export function requireOwnStudent(actor: Actor | null, studentId: string): ServiceResult<void> {
  if (!actor) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (actor.role === "student" && actor.linkedId === studentId) return okResult(undefined);
  if (actor.role === "general_manager") return okResult(undefined);
  if (actor.role === "general_admin" && actor.permissions.includes("students")) return okResult(undefined);
  return errResult("FORBIDDEN_OWNERSHIP", "본인의 데이터만 조회할 수 있습니다.");
}

/** Same idea as requireOwnStudent, for teacher-owned resources (own students/lessons,
 * own meeting links). */
export function requireOwnTeacher(actor: Actor | null, teacherId: string): ServiceResult<void> {
  if (!actor) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (actor.role === "teacher" && actor.linkedId === teacherId) return okResult(undefined);
  if (actor.role === "general_manager") return okResult(undefined);
  if (actor.role === "general_admin" && actor.permissions.includes("teachers")) return okResult(undefined);
  return errResult("FORBIDDEN_OWNERSHIP", "본인의 데이터만 조회할 수 있습니다.");
}

/** For resources both the owning student AND their own teacher may legitimately read
 * (e.g. a DailyEvaluation), falling back to a permission check for admin/manager access. */
export function requireStudentOrOwningTeacherOrPermission(
  actor: Actor | null,
  studentId: string,
  teacherId: string,
  key: PermissionKey,
): ServiceResult<void> {
  if (!actor) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  if (actor.role === "student" && actor.linkedId === studentId) return okResult(undefined);
  if (actor.role === "teacher" && actor.linkedId === teacherId) return okResult(undefined);
  return requirePermission(actor, key);
}
