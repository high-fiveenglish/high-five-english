// 수강신청 폼 "교육과정" 선택지 — 유아/초등/중고등/성인 4개 연령대별로, 그 연령대가
// 실제로 듣는 분야만 골라 보여준다(2단계 선택: 연령대 → 분야). 각 field id는
// src/data/curriculum.ts의 실제 커리큘럼 단계/전문과정과 대략 대응되지만, 이 파일은
// "신청서에서 어떤 조합을 고를 수 있는가"만 다루는 별도의 목록이다 — curriculum.ts는
// "그 단계에서 어떤 교재를 쓰는가"를 보여주는 공개 페이지용 데이터라 목적이 다르다.
//
// 저장 형식: admin DB(Enrollment/EnrollmentRequest)의 curriculumTrack이 단일 String
// 컬럼이라, 연령대와 분야를 "{ageGroup}:{field}" 하나의 문자열로 합쳐 그대로 저장한다.
export type CurriculumAgeGroup = "preschool" | "elementary" | "secondary" | "adult";

export type CurriculumField =
  | "phonics"
  | "basic-conversation"
  | "reading-smalltalk"
  | "native-reading"
  | "conversation-debate"
  | "advanced-discussion"
  | "exam"
  | "business"
  | "expression"
  | "interview";

export const CURRICULUM_AGE_GROUPS: CurriculumAgeGroup[] = ["preschool", "elementary", "secondary", "adult"];

export const CURRICULUM_FIELDS_BY_AGE_GROUP: Record<CurriculumAgeGroup, CurriculumField[]> = {
  preschool: ["phonics", "basic-conversation"],
  elementary: ["phonics", "basic-conversation", "reading-smalltalk", "native-reading"],
  secondary: ["reading-smalltalk", "conversation-debate", "advanced-discussion", "exam"],
  adult: ["conversation-debate", "advanced-discussion", "business", "exam", "expression", "interview"],
};

export function curriculumTrackId(ageGroup: CurriculumAgeGroup, field: CurriculumField): string {
  return `${ageGroup}:${field}`;
}

export function parseCurriculumTrackId(track: string): { ageGroup: string; field: string } {
  const sepIndex = track.indexOf(":");
  if (sepIndex === -1) return { ageGroup: track, field: "" };
  return { ageGroup: track.slice(0, sepIndex), field: track.slice(sepIndex + 1) };
}

export const ALL_CURRICULUM_TRACKS: string[] = CURRICULUM_AGE_GROUPS.flatMap((group) =>
  CURRICULUM_FIELDS_BY_AGE_GROUP[group].map((field) => curriculumTrackId(group, field)),
);
