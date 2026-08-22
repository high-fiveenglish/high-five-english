// 관리자 레벨테스트 신청 폼(학생관리 → 레벨테스트 등록)의 선택지 — 단일 출처.
// 값은 전부 문자열로 저장되므로(LevelTest.subject/classMethod/englishLevel/ageGroup/
// interestTopic) 운영 중 항목을 추가/변경해도 이 파일만 고치면 되고, 이후 별도 관리
// 테이블로 승격할 때도 값 그대로 옮길 수 있다.

export const SUBJECT_OPTIONS = [{ value: "online_english", label: "온라인영어" }] as const;

export const CLASS_METHOD_OPTIONS = [
  { value: "teams", label: "팀즈수업" },
  { value: "zoom", label: "줌수업" },
  { value: "tencent", label: "텐센트수업" },
] as const;

export const ENGLISH_LEVEL_OPTIONS = [
  { value: "beginner", label: "[초급] 회화는 처음인 왕초보예요." },
  { value: "intermediate", label: "[중급] 간단하게 말할 수 있어요." },
  { value: "advanced", label: "[고급] 프리토킹이 가능해요." },
] as const;

export const AGE_GROUP_OPTIONS = [
  { value: "elementary_low", label: "초등 저학년 (1~3학년)" },
  { value: "elementary_high", label: "초등 고학년 (4~6학년)" },
  { value: "middle", label: "중학생" },
  { value: "high", label: "고등학생" },
  { value: "adult", label: "성인" },
] as const;

export const INTEREST_TOPIC_OPTIONS = [
  "Business",
  "Culture",
  "Entertainment",
  "Food",
  "Health",
  "History",
  "Humor",
  "Literature",
  "Mysteries",
  "Nature",
  "Politics",
  "Sports",
  "Technology",
  "Travel",
  "Others",
].map((v) => ({ value: v, label: v }));
