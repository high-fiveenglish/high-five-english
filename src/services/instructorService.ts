// Instructor mock service layer — same requirePermission-first pattern as
// noticeService.ts/reviewService.ts. Uses the "teachers" PermissionKey, which already
// existed in src/lib/auth/types.ts (already labeled, already granted to admin1) but had
// no service function actually checking it until now.
import type { Instructor } from "../data/instructors";
import { ACCOUNTS } from "../data/accounts";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { store } from "./store";

function nextInstructorId(nameEn: string): string {
  const slug = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug || "instructor"}-${Date.now()}`;
}

export type InstructorInput = Omit<Instructor, "id" | "order">;

export async function listPublicInstructors(): Promise<Instructor[]> {
  return [...store.instructors].filter((i) => i.published).sort((a, b) => a.order - b.order);
}

export async function listAllInstructors(actor: Actor | null): Promise<ServiceResult<Instructor[]>> {
  const guard = requirePermission(actor, "teachers");
  if (!guard.ok) return guard;
  return okResult([...store.instructors].sort((a, b) => a.order - b.order));
}

export async function createInstructor(
  actor: Actor | null,
  input: InstructorInput,
): Promise<ServiceResult<Instructor>> {
  const guard = requirePermission(actor, "teachers");
  if (!guard.ok) return guard;

  const maxOrder = store.instructors.reduce((max, i) => Math.max(max, i.order), 0);
  const instructor: Instructor = { ...input, id: nextInstructorId(input.nameEn), order: maxOrder + 1 };
  store.instructors = [...store.instructors, instructor];
  return okResult(instructor);
}

export async function updateInstructor(
  actor: Actor | null,
  id: string,
  input: InstructorInput,
): Promise<ServiceResult<Instructor>> {
  const guard = requirePermission(actor, "teachers");
  if (!guard.ok) return guard;

  const existing = store.instructors.find((i) => i.id === id);
  if (!existing) return errResult("NOT_FOUND", "강사 정보를 찾을 수 없습니다.");

  const updated: Instructor = { ...input, id: existing.id, order: existing.order };
  store.instructors = store.instructors.map((i) => (i.id === id ? updated : i));
  return okResult(updated);
}

/** True if this instructor is a real, active teacher — has a login account and/or a
 * current enrollment — rather than a display-only profile with no backing account
 * (e.g. the demo "daniel" entry). Referenced by deleteInstructor so a delete can never
 * silently break the student classroom lookup (classroomService.getMyClassroom) or a
 * teacher's own login. */
function isReferencedElsewhere(id: string): boolean {
  const hasAccount = ACCOUNTS.some((a) => a.role === "teacher" && a.linkedId === id);
  const hasEnrollment = store.enrollments.some((e) => e.teacherId === id);
  return hasAccount || hasEnrollment;
}

export async function deleteInstructor(actor: Actor | null, id: string): Promise<ServiceResult<void>> {
  const guard = requirePermission(actor, "teachers");
  if (!guard.ok) return guard;

  if (isReferencedElsewhere(id)) {
    return errResult(
      "FORBIDDEN_OWNERSHIP",
      "재직 중인 강사 계정이거나 배정된 수강생이 있어 삭제할 수 없습니다. 비공개 처리를 이용해주세요.",
    );
  }
  store.instructors = store.instructors.filter((i) => i.id !== id);
  return okResult(undefined);
}

export async function reorderInstructors(
  actor: Actor | null,
  orderedIds: string[],
): Promise<ServiceResult<Instructor[]>> {
  const guard = requirePermission(actor, "teachers");
  if (!guard.ok) return guard;

  const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
  store.instructors = store.instructors.map((i) => ({
    ...i,
    order: orderIndex.get(i.id) ?? i.order,
  }));
  return okResult([...store.instructors].sort((a, b) => a.order - b.order));
}
