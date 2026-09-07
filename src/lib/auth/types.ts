// Role/permission model for the mock multi-account system. There is no real backend —
// these types describe exactly what a future API's auth middleware would check. Today
// the same checks run inside the mock service layer (see permissions.ts), so the
// enforcement is structurally identical to a real API and can move server-side later
// without changing its shape.
import type { SchedulingErrorCode } from "../scheduling/types";

export type Role = "student" | "teacher" | "general_admin" | "general_manager";

export type PermissionKey =
  | "students"
  | "teachers"
  | "lessons"
  | "schedule"
  | "textbooks"
  | "evaluations"
  | "attendance"
  | "holidays"
  | "meetingLinks"
  | "payments"
  | "siteSettings"
  | "notices"
  | "homeNotices"
  | "reviews"
  | "levelTest"
  | "pricing";

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  students: "학생 관리",
  teachers: "강사 관리",
  lessons: "수업 관리",
  schedule: "스케줄 관리",
  textbooks: "교재 관리",
  evaluations: "학습평가서 관리",
  attendance: "출결 관리",
  holidays: "휴일 관리",
  meetingLinks: "화상회의 링크 관리",
  payments: "결제 관리",
  siteSettings: "사이트 설정",
  notices: "강사 공지사항 관리",
  homeNotices: "학생 공지사항 관리",
  reviews: "수강후기 관리",
  levelTest: "레벨테스트 신청 관리",
  pricing: "수강료 관리",
};

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as PermissionKey[];

/** The authenticated identity a service-layer function acts on behalf of. */
export interface Actor {
  role: Role;
  accountId: string;
  /** studentId for a student, teacherId for a teacher, null for admin/manager. */
  linkedId: string | null;
  /** Only meaningful for general_admin — general_manager passes every check via role alone. */
  permissions: PermissionKey[];
}

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_PERMISSION"
  | "FORBIDDEN_OWNERSHIP"
  | "INVALID_CREDENTIALS"
  | "NOT_FOUND";

/** Deliberately shape-compatible with scheduling's Result<T> ({ok,value}|{ok,error}), so
 * a Result<T> returned by the scheduling engine is directly usable as a ServiceResult<T>
 * without wrapping — a service function can permission-check first, then delegate to the
 * engine and return its Result as-is. */
export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AuthErrorCode | SchedulingErrorCode; message: string } };

export function okResult<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}

export function errResult<T>(code: AuthErrorCode, message: string): ServiceResult<T> {
  return { ok: false, error: { code, message } };
}
