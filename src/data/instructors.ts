import type { MeetingPlatformId } from "./meetingPlatforms";

export type Instructor = {
  id: string;
  name: string;
  nameEn: string;
  country: string;
  flag: string;
  tags: string[];
  gradient: string;
  intro: string;
  detail: string;
  audioSrc: string;
  career: string[];
  /** Pre-fills a new enrollment's meetingPlatform when an admin assigns this
   * teacher — informational default only, not read at runtime by student screens. */
  defaultMeetingPlatform?: MeetingPlatformId;
};

// NOTE: Photos are placeholder initials-avatars. Swap in real instructor
// headshots (and real recordings for audioSrc) once available.
export const INSTRUCTORS: Instructor[] = [
  {
    id: "sarah",
    name: "사라",
    nameEn: "Sarah T.",
    country: "미국",
    flag: "🇺🇸",
    tags: ["초등 전문", "발음 교정", "파닉스"],
    gradient: "from-brand-500 to-brand-700",
    intro: "밝은 에너지로 아이들의 말문을 열어주는 초등 전문 강사예요.",
    detail:
      "10년 이상 어린이 영어교육 경력을 가진 강사로, 파닉스부터 리딩까지 단계별 반복훈련을 통해 아이가 스스로 문장을 만들어낼 수 있도록 지도합니다. 칭찬과 격려 중심의 수업으로 첫 화상영어를 시작하는 아이들에게 특히 잘 맞아요.",
    audioSrc: "/audio/intro-1.wav",
    career: ["TESOL 자격 보유", "초등영어 전문 8년", "하이파이브 강사 평가 최상위"],
  },
  {
    id: "james",
    name: "제임스",
    nameEn: "James K.",
    country: "캐나다",
    flag: "🇨🇦",
    tags: ["중고등 전문", "문법/작문", "토론"],
    gradient: "from-brand-600 to-brand-900",
    intro: "논리적인 피드백으로 실력을 빠르게 끌어올리는 중고등 전문 강사예요.",
    detail:
      "중고등학생 및 성인 학습자를 대상으로 문법 교정, 에세이 작문, 토론 수업을 진행합니다. 단순 대화에 그치지 않고 문장 단위의 정확한 피드백을 제공해 시험 영어와 실전 영어를 동시에 잡아줍니다.",
    audioSrc: "/audio/intro-2.wav",
    career: ["캐나다 온타리오 교육학 학사", "중고등 영어 전문 6년", "IELTS/토플 라이팅 코칭"],
    defaultMeetingPlatform: "zoom",
  },
  {
    id: "emily",
    name: "에밀리",
    nameEn: "Emily R.",
    country: "영국",
    flag: "🇬🇧",
    tags: ["성인 회화", "비즈니스 영어", "프리토킹"],
    gradient: "from-accent-400 to-accent-600",
    intro: "실생활과 업무에 바로 쓰는 표현으로 자신감을 채워주는 강사예요.",
    detail:
      "성인 학습자의 목표에 맞춰 여행, 비즈니스, 일상 회화 등 맞춤형 커리큘럼을 구성합니다. 완벽한 문장보다 '일단 말해보는 용기'를 강조하며, 실수한 표현은 수업 중 바로바로 교정해드립니다.",
    audioSrc: "/audio/intro-3.wav",
    career: ["영국 브라이튼 대학교 졸업", "비즈니스 영어 코칭 5년", "성인 학습자 만족도 최상위"],
  },
  {
    id: "daniel",
    name: "다니엘",
    nameEn: "Daniel P.",
    country: "호주",
    flag: "🇦🇺",
    tags: ["전 연령", "프리토킹", "발음 교정"],
    gradient: "from-brand-400 to-brand-600",
    intro: "편안한 분위기 속에서 영어로 생각하는 힘을 길러주는 강사예요.",
    detail:
      "유쾌하고 친근한 진행으로 학습자의 긴장을 풀어주는 데 강점이 있습니다. 질문과 답변을 반복하며 즉흥적으로 문장을 만들어내는 훈련을 통해 실제 대화 상황에서의 순발력을 키워줍니다.",
    audioSrc: "/audio/intro-4.wav",
    career: ["호주 시드니 교육 전공", "전 연령 화상영어 7년", "발음 교정 특화 과정 이수"],
  },
];
