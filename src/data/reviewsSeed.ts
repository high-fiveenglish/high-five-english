import type { StudentReview } from "../lib/community/types";

// Demo seed for the real, student-authored review system — distinct from the static
// marketing testimonials in src/data/reviews.ts. Kept as a plain data file (not inside
// store.ts) so store.ts doesn't need to define types, matching classroomMock.ts.
export const SEED_STUDENT_REVIEWS: StudentReview[] = [
  {
    id: "sreview-1",
    studentId: "demo-student",
    studentEnglishName: "Minjun Kim",
    teacherId: "james",
    teacherName: "제임스",
    content:
      "제임스 선생님과 수업하면서 문법 실수를 그때그때 바로 고쳐주셔서 자신감이 많이 늘었어요. 매주 기대되는 수업입니다.",
    createdAt: "2026-08-01T09:00:00.000Z",
    published: true,
  },
  {
    id: "sreview-2",
    studentId: "student-3",
    studentEnglishName: "Doyoon Park",
    teacherId: "sarah",
    teacherName: "사라",
    content:
      "발음 교정에 정말 신경을 많이 써주셔서 짧은 기간에도 확실히 달라진 게 느껴졌습니다. 추천합니다!",
    createdAt: "2026-08-12T09:00:00.000Z",
    published: true,
  },
];
