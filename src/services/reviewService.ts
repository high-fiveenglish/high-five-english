// Real, student-authored review mock service layer. submitReview only accepts free-text
// `content` from the client — studentEnglishName/teacherId/teacherName are always
// resolved server-side from the actor's own active enrollment, so a student can never
// claim to be reviewing a teacher they aren't actually assigned to, or use someone
// else's name. Same requirePermission pattern as adminService.ts for moderation.
import type { StudentReview } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission, requireRole } from "../lib/auth/permissions";
import { INSTRUCTORS } from "../data/instructors";
import { findStudentEnglishName } from "./classroomService";
import { store } from "./store";

function nextReviewId(): string {
  return `sreview-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function submitReview(
  actor: Actor | null,
  input: { content: string },
): Promise<ServiceResult<StudentReview>> {
  const guard = requireRole(actor, ["student"]);
  if (!guard.ok) return guard;

  const enrollment = store.enrollments.find(
    (e) => e.studentId === actor!.linkedId && e.status === "active",
  );
  if (!enrollment) {
    return errResult("NOT_FOUND", "진행 중인 수강 정보를 찾을 수 없어 후기를 작성할 수 없습니다.");
  }

  const review: StudentReview = {
    id: nextReviewId(),
    studentId: actor!.linkedId!,
    studentEnglishName: findStudentEnglishName(actor!.linkedId!),
    teacherId: enrollment.teacherId,
    teacherName: INSTRUCTORS.find((i) => i.id === enrollment.teacherId)?.name ?? enrollment.teacherId,
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
    published: false,
  };
  store.studentReviews = [review, ...store.studentReviews];
  return okResult(review);
}

export async function listMyReviews(actor: Actor | null): Promise<ServiceResult<StudentReview[]>> {
  const guard = requireRole(actor, ["student"]);
  if (!guard.ok) return guard;
  return okResult(
    store.studentReviews
      .filter((r) => r.studentId === actor!.linkedId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

export async function listPublishedReviews(): Promise<StudentReview[]> {
  return [...store.studentReviews]
    .filter((r) => r.published)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllReviews(actor: Actor | null): Promise<ServiceResult<StudentReview[]>> {
  const guard = requirePermission(actor, "reviews");
  if (!guard.ok) return guard;
  return okResult([...store.studentReviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function setReviewPublished(
  actor: Actor | null,
  id: string,
  published: boolean,
): Promise<ServiceResult<StudentReview>> {
  const guard = requirePermission(actor, "reviews");
  if (!guard.ok) return guard;

  const existing = store.studentReviews.find((r) => r.id === id);
  if (!existing) return errResult("NOT_FOUND", "후기를 찾을 수 없습니다.");

  const updated = { ...existing, published };
  store.studentReviews = store.studentReviews.map((r) => (r.id === id ? updated : r));
  return okResult(updated);
}

export async function deleteReview(actor: Actor | null, id: string): Promise<ServiceResult<void>> {
  const guard = requirePermission(actor, "reviews");
  if (!guard.ok) return guard;
  store.studentReviews = store.studentReviews.filter((r) => r.id !== id);
  return okResult(undefined);
}
