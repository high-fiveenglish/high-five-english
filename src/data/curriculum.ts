export type CurriculumStage = {
  id: string;
  stage: number;
  name: string;
  ageRange: string;
  goal: string;
  focus: string[];
  books: string[];
};

// Source: E:\★화상영어★\books (200여 종의 교재를 연령·레벨·목적 기준으로 재분류)
// 교재는 계속 추가되므로, 아래 목록은 각 단계를 대표하는 예시입니다.
export const CURRICULUM_STAGES: CurriculumStage[] = [
  {
    id: "phonics",
    stage: 1,
    name: "파닉스 · 첫 영어",
    ageRange: "유아 ~ 초등 1학년",
    goal: "알파벳과 소리 규칙을 익히고, 짧은 문장을 듣고 따라 말합니다.",
    focus: ["알파벳/파닉스", "짧은 문장 듣고 말하기", "기초 어휘"],
    books: ["Smart Phonics", "Oxford Phonics World", "Let's Go Phonics", "Progressive Phonics"],
  },
  {
    id: "basic-conversation",
    stage: 2,
    name: "기초 회화 · 리더스 시작",
    ageRange: "초등 1 ~ 3학년",
    goal: "일상적인 표현으로 짧은 대화를 주고받고, 그림책 수준의 리딩을 시작합니다.",
    focus: ["일상 표현 대화", "그림책 리딩", "질문·답변 패턴"],
    books: ["Everybody Up", "Family and Friends", "Big English", "Backpack", "National Geographic Our World"],
  },
  {
    id: "reading-smalltalk",
    stage: 3,
    name: "리딩 강화 · 스몰토크",
    ageRange: "초등 3 ~ 6학년",
    goal: "문단 단위의 글을 읽고, 주제에 대해 몇 문장으로 자기 생각을 말합니다.",
    focus: ["문단 리딩", "주제 스몰토크", "기초 라이팅"],
    books: ["Oxford Discover", "Reading Explorer", "Bricks Reading", "Subject Link", "I Can Write English"],
  },
  {
    id: "conversation-debate",
    stage: 4,
    name: "본격 회화 · 디베이트",
    ageRange: "초등 고학년 ~ 중학생",
    goal: "정확한 문법으로 대화를 이어가고, 근거를 들어 자기 의견을 논리적으로 말합니다.",
    focus: ["문법 기반 대화", "의견 말하기", "디베이트 입문"],
    books: ["American Headway", "Touchstone", "Interchange", "Grammar in Use", "Debate Pro Junior", "Debating Challenge"],
  },
  {
    id: "advanced-discussion",
    stage: 5,
    name: "고급 회화 · 시사토론 · 비즈니스",
    ageRange: "고등학생 ~ 성인",
    goal: "시사·전문 주제로 토론하고, 발표와 실무 상황에서 쓰는 영어를 연습합니다.",
    focus: ["시사 토론", "발표·프레젠테이션", "실무 영어"],
    books: ["English File", "World English - TED Talks", "World News", "Vocabulary in Use", "Business English Course"],
  },
];

export const NATIVE_READING_TRACK = {
  title: "원서 리딩 트랙",
  desc: "리딩 레벨이 빠른 학생을 위한 별도 트랙입니다. AR(Accelerated Reader) 지수를 기준으로 챕터북부터 문학 작품까지 단계적으로 읽어나갑니다.",
  books: [
    { title: "Nate the Great / Henry and Mudge", level: "AR 2.0~2.5" },
    { title: "Frog and Toad Are Friends", level: "AR 2.9" },
    { title: "Judy Moody Was in a Mood", level: "AR 3.0~3.5" },
    { title: "Matilda / The Giver", level: "심화" },
    { title: "To Kill a Mockingbird / Lord of the Flies / Animal Farm / Hunger Games", level: "고급" },
  ],
};

export type SpecialtyProgram = {
  id: string;
  title: string;
  desc: string;
  books: string[];
};

export const SPECIALTY_PROGRAMS: SpecialtyProgram[] = [
  {
    id: "business",
    title: "비즈니스 영어",
    desc: "실무 이메일, 회의, 프레젠테이션 등 업무 상황에서 바로 쓰는 표현을 연습합니다.",
    books: ["Business English Course", "Business Venture", "English for Everyone Business", "Let's Talk Business"],
  },
  {
    id: "exam",
    title: "시험 대비",
    desc: "토익·토플·아이엘츠·오픽 등 목표 시험 유형에 맞춘 실전 학습을 진행합니다.",
    books: ["TOEIC / TOEIC Speaking", "TOEFL", "Cambridge IELTS", "OPIc", "SAT·GRE 501 시리즈"],
  },
  {
    id: "expression",
    title: "표현 · 어휘 강화",
    desc: "원어민이 실제로 쓰는 관용표현과 어휘를 상황별로 익힙니다.",
    books: ["Idioms for Everyday Use", "Phrasal Verbs Course", "English Collocations in Use", "Vocabulary Workshop"],
  },
  {
    id: "interview",
    title: "인터뷰 · 발음",
    desc: "면접 상황별 예상 질문 연습과 발음 교정 훈련을 함께 진행합니다.",
    books: ["Job Interview Q&A", "Cambridge English for Job Hunting", "Pronunciation Course"],
  },
];
