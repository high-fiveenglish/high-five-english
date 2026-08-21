// Instructor service layer. listPublicInstructors now reads from the real admin/LMS
// backend's public API (admin/src/app/api/public/instructors) — the admin's "강사소개
// 관리" screen there is the source of truth for the public marketing display. Falls
// back to the local mock store if that backend is unreachable (e.g. running this site
// standalone without the admin app), so the homepage never renders an empty section.
// The admin-only functions below (create/update/delete/reorder) still operate on this
// mock store and back the OLD Vite admin instructor CRUD page — that page still works,
// it just no longer affects what the public homepage shows (see levelTestService.ts for
// the same pattern, applied first).
import type { Instructor } from "../data/instructors";
import { ACCOUNTS } from "../data/accounts";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { store } from "./store";
import { ADMIN_API_URL } from "../lib/adminApi";

function nextInstructorId(nameEn: string): string {
  const slug = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug || "instructor"}-${Date.now()}`;
}

export type InstructorInput = Omit<Instructor, "id" | "order">;

type BackendInstructor = {
  id: number;
  slug: string;
  name: string;
  nameEn: string;
  country: string;
  flag: string;
  gradient: string;
  photoUrl: string | null;
  audioSrc: string | null;
  defaultMeetingPlatform: string | null;
  bio: string;
  career: string[];
  availableDays: number[];
  availableHours: string;
  classFeatures: string[];
  specialties: string[];
  levels: string[];
  teachingStyle: string;
  published: boolean;
  order: number;
};

function fromBackend(i: BackendInstructor): Instructor {
  return {
    id: i.slug,
    name: i.name,
    nameEn: i.nameEn,
    country: i.country,
    flag: i.flag,
    gradient: i.gradient,
    photoUrl: i.photoUrl ?? undefined,
    audioSrc: i.audioSrc ?? undefined,
    defaultMeetingPlatform: (i.defaultMeetingPlatform ?? undefined) as Instructor["defaultMeetingPlatform"],
    bio: i.bio,
    career: i.career,
    availableDays: i.availableDays as Instructor["availableDays"],
    availableHours: i.availableHours,
    classFeatures: i.classFeatures,
    specialties: i.specialties,
    levels: i.levels as Instructor["levels"],
    teachingStyle: i.teachingStyle,
    published: i.published,
    order: i.order,
  };
}

export async function listPublicInstructors(): Promise<Instructor[]> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/instructors`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as BackendInstructor[];
    return data.map(fromBackend);
  } catch (err) {
    console.warn("[instructorService] admin backend unreachable, falling back to mock store", err);
    return [...store.instructors].filter((i) => i.published).sort((a, b) => a.order - b.order);
  }
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
