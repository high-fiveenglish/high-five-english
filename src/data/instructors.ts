import type { MeetingPlatformId } from "./meetingPlatforms";
import type { WeekDay } from "../lib/scheduling/types";
import type { CEFRLevel } from "./textbookCatalog";

export type Instructor = {
  /** Immutable once created — teacher login accounts (Account.linkedId) and
   * enrollments (Enrollment.teacherId) reference this id by convention, so renaming
   * or reusing it would silently break the student classroom lookup. See
   * instructorService.deleteInstructor for the referential-integrity guard this
   * implies. */
  id: string;
  name: string;
  nameEn: string;
  country: string;
  flag: string;
  /** Background shown when no photo has been uploaded — never removed even once a
   * photo exists, so a photo can always be cleared back to this decorative fallback. */
  gradient: string;
  photoUrl?: string;
  audioSrc?: string;
  /** Pre-fills a new enrollment's meetingPlatform when an admin assigns this
   * teacher — informational default only, not read at runtime by student screens. */
  defaultMeetingPlatform?: MeetingPlatformId;
  bio: string;
  career: string[];
  availableDays: WeekDay[];
  availableHours: string;
  classFeatures: string[];
  specialties: string[];
  levels: CEFRLevel[];
  teachingStyle: string;
  published: boolean;
  order: number;
};

// NOTE: Photos are placeholder initials-avatars until an admin uploads a real one via
// the admin instructor CRUD (src/pages/AdminInstructorsPage.tsx). This array is the
// SEED for src/services/store.ts's mutable `instructors` — admin edits only ever
// change the store copy, never this file. Kept here (rather than deleted) because
// src/data/classroomMock.ts's seed construction still reads directly from this array
// by id for the 3 teachers with real login accounts (sarah/james/emily).
export const INSTRUCTORS: Instructor[] = [
  {
    id: "sarah",
    name: "사라",
    nameEn: "Sarah T.",
    country: "미국",
    flag: "🇺🇸",
    gradient: "from-brand-500 to-brand-700",
    audioSrc: "/audio/intro-1.wav",
    bio: "10년 이상 어린이 영어교육 경력을 가진 강사로, 파닉스부터 리딩까지 단계별 반복훈련을 통해 아이가 스스로 문장을 만들어낼 수 있도록 지도합니다. 칭찬과 격려 중심의 수업으로 첫 화상영어를 시작하는 아이들에게 특히 잘 맞아요.",
    career: ["TESOL 자격 보유", "초등영어 전문 8년", "하이파이브 강사 평가 최상위"],
    availableDays: [1, 2, 3, 4, 5],
    availableHours: "평일 15:00–20:00",
    classFeatures: ["초등 전문", "발음 교정", "파닉스"],
    specialties: ["파닉스", "발음 교정", "초등 회화"],
    levels: ["pre-a1", "a1", "a2"],
    teachingStyle: "칭찬과 격려 중심의 반복 훈련형 수업",
    published: true,
    order: 1,
  },
  {
    id: "james",
    name: "제임스",
    nameEn: "James K.",
    country: "캐나다",
    flag: "🇨🇦",
    gradient: "from-brand-600 to-brand-900",
    audioSrc: "/audio/intro-2.wav",
    defaultMeetingPlatform: "zoom",
    bio: "중고등학생 및 성인 학습자를 대상으로 문법 교정, 에세이 작문, 토론 수업을 진행합니다. 단순 대화에 그치지 않고 문장 단위의 정확한 피드백을 제공해 시험 영어와 실전 영어를 동시에 잡아줍니다.",
    career: ["캐나다 온타리오 교육학 학사", "중고등 영어 전문 6년", "IELTS/토플 라이팅 코칭"],
    availableDays: [1, 3, 5],
    availableHours: "평일 18:00–22:00",
    classFeatures: ["중고등 전문", "문법/작문", "토론"],
    specialties: ["문법 교정", "에세이 작문", "토론"],
    levels: ["b1", "b2", "b2plus"],
    teachingStyle: "문장 단위의 정확한 피드백 중심 수업",
    published: true,
    order: 2,
  },
  {
    id: "emily",
    name: "에밀리",
    nameEn: "Emily R.",
    country: "영국",
    flag: "🇬🇧",
    gradient: "from-accent-400 to-accent-600",
    audioSrc: "/audio/intro-3.wav",
    bio: "성인 학습자의 목표에 맞춰 여행, 비즈니스, 일상 회화 등 맞춤형 커리큘럼을 구성합니다. 완벽한 문장보다 '일단 말해보는 용기'를 강조하며, 실수한 표현은 수업 중 바로바로 교정해드립니다.",
    career: ["영국 브라이튼 대학교 졸업", "비즈니스 영어 코칭 5년", "성인 학습자 만족도 최상위"],
    availableDays: [1, 2, 3, 4, 5, 6],
    availableHours: "평일·토요일 19:00–23:00",
    classFeatures: ["성인 회화", "비즈니스 영어", "프리토킹"],
    specialties: ["비즈니스 영어", "여행 영어", "프리토킹"],
    levels: ["a2", "b1", "b2"],
    teachingStyle: "'일단 말하기'를 강조하는 실전형 수업",
    published: true,
    order: 3,
  },
  {
    id: "daniel",
    name: "다니엘",
    nameEn: "Daniel P.",
    country: "호주",
    flag: "🇦🇺",
    gradient: "from-brand-400 to-brand-600",
    audioSrc: "/audio/intro-4.wav",
    bio: "유쾌하고 친근한 진행으로 학습자의 긴장을 풀어주는 데 강점이 있습니다. 질문과 답변을 반복하며 즉흥적으로 문장을 만들어내는 훈련을 통해 실제 대화 상황에서의 순발력을 키워줍니다.",
    career: ["호주 시드니 교육 전공", "전 연령 화상영어 7년", "발음 교정 특화 과정 이수"],
    availableDays: [2, 4, 6],
    availableHours: "화·목·토 17:00–21:00",
    classFeatures: ["전 연령", "프리토킹", "발음 교정"],
    specialties: ["프리토킹", "발음 교정", "즉흥 회화 훈련"],
    levels: ["a1", "a2", "b1"],
    teachingStyle: "질문과 답변을 반복하는 즉흥 대화 훈련형 수업",
    published: true,
    order: 4,
  },
];
