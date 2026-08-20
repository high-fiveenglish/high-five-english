// Source: 사용자가 사전 분석한 "교재 레벨 카탈로그" 아티팩트
// (E:\★화상영어★\books 아래 Conversation · Grammar · Reading books 폴더,
// 카테고리·CEFR 레벨·연령대·추천포인트)
// 폴더에 교재가 추가되면 이 배열에 행을 추가해 갱신합니다.

export type CEFRLevel = "pre-a1" | "a1" | "a2" | "b1" | "b2" | "b2plus";

export const LEVEL_ORDER: CEFRLevel[] = ["pre-a1", "a1", "a2", "b1", "b2", "b2plus"];

export const LEVEL_LABELS: Record<CEFRLevel, string> = {
  "pre-a1": "Pre-A1",
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  b2plus: "B2+",
};

export const LEVEL_DESCRIPTIONS: Record<CEFRLevel, string> = {
  "pre-a1": "문자·파닉스",
  a1: "초급",
  a2: "초중급",
  b1: "중급",
  b2: "중상급",
  b2plus: "상급·시사",
};

export const LEVEL_COLORS: Record<CEFRLevel, string> = {
  "pre-a1": "#7a9a63",
  a1: "#8ea34a",
  a2: "#b79a35",
  b1: "#c4842f",
  b2: "#bd5a3a",
  b2plus: "#9c4763",
};

export const AGE_GROUPS = ["유아", "초등저", "초등고", "중등", "고등", "성인"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const FOLDERS = ["Conversation", "Grammar", "Reading books"] as const;
export type Folder = (typeof FOLDERS)[number];

type RawEntry = [name: string, category: string, levelText: string, ages: AgeGroup[], note: string];

const RAW_CONVERSATION: RawEntry[] = [
  ["Active English Discussion", "디베이트·스피치", "B1-B2", ["고등", "성인"], "시사 주제 토론 스피킹, 논리적 의견 말하기 훈련"],
  ["Backpack 1-6 (구판+신판)", "초등 종합영어", "Pre-A1-A1", ["유아", "초등저"], "Pearson 챈트·스토리 중심 유아·초등 종합영어"],
  ["Daily English", "성인 종합영어", "A1-A2", ["중등", "고등", "성인"], "생활 밀착 표현, 실용회화 입문"],
  ["Exploring English 1-6", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "리딩·회화 병행 초등 종합 시리즈"],
  ["News Discussion", "디베이트·스피치", "B1-B2", ["고등", "성인"], "뉴스 기반 시사 토론, 어휘·논증 확장"],
  ["Situation English 1~60", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "상황별 패턴회화, 60권 세분화로 반복 훈련"],
  ["True Stories", "그레이디드 리딩", "B1", ["중등", "고등"], "Pearson 실화 기반 리딩, 문형 통제 리더스"],
  ["WonderSkills Reading", "논픽션·시사 리딩", "A2-B1", ["초등고"], "논픽션 독해 스킬(주제파악·추론) 훈련"],
  ["Kid's Box Activity Book 1-3", "유아 회화", "Pre-A1-A1", ["유아"], "Cambridge 유아 종합영어, 챈트·액티비티 중심"],
  ["100 Interactive English Lessons", "초등 종합영어", "A2", ["초등고", "중등"], "인터랙티브 패턴 스피킹 연습"],
  ["100-pattern-English", "성인 종합영어", "A1-A2", ["중등", "성인"], "필수 패턴 100개로 회화 뼈대 잡기"],
  ["1000 Useful Words 2018", "어휘", "A1-A2", ["초등고", "중등"], "생활 필수어휘 1000개 암기용"],
  ["2000 Core English Words 1-4", "어휘", "A2-B1", ["초등고", "중등", "고등"], "단계별 핵심어휘, 학년 대응 4권 세트"],
  ["4000 Essential English Words", "어휘", "A2-B2", ["중등", "고등", "성인"], "Compass 대표 어휘 시리즈, 예문·연습 충실"],
  ["50 Debate Prompts Kids", "디베이트·스피치", "A2", ["초등고"], "어린이 눈높이 디베이트 주제 모음"],
  ["50 Question English Basics", "성인 종합영어", "A1", ["중등", "성인"], "기초 질문·답변 패턴 회화(문서 자료)"],
  ["500 Real English Phrases", "성인 종합영어", "A2", ["중등", "고등", "성인"], "실전 생활표현 500개"],
  ["A Little Prince", "그레이디드 리딩", "B1-B2", ["중등", "고등", "성인"], "고전 각색 리더스, 문학 리딩 입문"],
  ["All in all books (?)", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "종합교재 추정 — 표지·목차 확인 필요"],
  ["American Headway 1-3", "성인 종합영어", "A1-B1", ["고등", "성인"], "Oxford 대표 성인 종합영어, 문법·스킬 균형"],
  ["American School Textbook (core/basic/easy/preschool)", "초등 종합영어", "Pre-A1-A2", ["유아", "초등저"], "미국 교과서 기반 리딩·회화, 레벨 세분화"],
  ["Big English 1-3 SB (American)", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "Pearson 미국판 초등 종합영어"],
  ["Big English 1-5 SB (British)", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "Pearson 영국판 초등 종합영어, 5권 세트"],
  ["Bricks Reading", "그레이디드 리딩", "A1-B1", ["초등저", "초등고"], "한국형 논픽션 리딩 대표 시리즈, 세밀한 레벨링"],
  ["Cambridge English for Job Hunting", "ESP(비즈니스·여행·시험)", "B1-B2", ["성인"], "구직·이력서·면접 영어 특화"],
  ["Can You Believe It 1-4", "그레이디드 리딩", "B1-B2", ["중등", "고등"], "Oxford 리스닝·리딩 통합, 흥미 위주 소재"],
  ["Close Reader 1-2", "논픽션·시사 리딩", "B1", ["중등"], "정독형 독해 연습"],
  ["Debate Pro Junior Book 1-4", "디베이트·스피치", "A2-B1", ["초등고", "중등"], "주니어 디베이트 입문, 논제·근거 구성 훈련"],
  ["Debating Challenge 1-3", "디베이트·스피치", "B1-B2", ["중등", "고등"], "본격 디베이트 포맷 연습"],
  ["Disney Learning Series", "유아 회화", "Pre-A1", ["유아"], "디즈니 캐릭터 활용 유아 첫걸음 영어"],
  ["Easy Link 1-5", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "리딩·문법 연계형 초등 종합 시리즈"],
  ["Easy English with Games 1-3", "유아 회화", "Pre-A1-A1", ["유아", "초등저"], "게임 기반 놀이식 초급 회화"],
  ["English File 4th Edition", "성인 종합영어", "A1-C1", ["고등", "성인"], "Oxford 성인 종합영어 스테디셀러, 전 레벨"],
  ["Everybody Up 1-6 2nd", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "Oxford 초등 종합영어, 챈트·스토리 활용"],
  ["Everyday English", "성인 종합영어", "A2-B1", ["중등", "고등", "성인"], "생활영어 표현 중심"],
  ["Everyone Speak Kids 1-3", "유아 회화", "Pre-A1-A1", ["유아", "초등저"], "유아·초등저 스피킹 입문"],
  ["Exploring Reading Easy 1-2", "그레이디드 리딩", "Pre-A1-A1", ["초등저"], "리딩 스킬 입문, 쉬운 난이도"],
  ["Exploring Reading Very Easy 1-3", "그레이디드 리딩", "Pre-A1", ["초등저"], "리딩 스킬 최초 입문 단계"],
  ["Express Yourself 1-2", "디베이트·스피치", "A2", ["초등고", "중등"], "자기표현 스피킹 훈련"],
  ["Family and Friends 1-6 2nd Edition", "초등 종합영어", "Pre-A1-A2", ["유아", "초등저", "초등고"], "Oxford 초등 종합영어 대표 시리즈, 세계적 표준"],
  ["Fly High, Fly Guy!", "스토리북·그림책", "A1", ["초등저"], "미국 인기 캐릭터 리더스, 재미 위주"],
  ["Fun With Language Book 1-6", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "문법+표현 통합 종합 시리즈"],
  ["General English (?)", "성인 종합영어", "A2-B1", ["고등", "성인"], "일반영어 교재 추정 — 출판사 확인 필요"],
  ["Getting the Message 1-3", "논픽션·시사 리딩", "B1", ["중등"], "리스닝·독해 통합 연습"],
  ["Global News", "논픽션·시사 리딩", "B2", ["고등", "성인"], "시사 뉴스 리딩, 고급 어휘·시사 배경지식"],
  ["Global Favorite Book01 (미국교과서 리딩 AST basic1)", "논픽션·시사 리딩", "A2", ["초등고"], "미국 교과서형 논픽션 리딩"],
  ["Guided Writing Plus 1", "라이팅", "A2-B1", ["초등고", "중등"], "단계별 가이드 라이팅 훈련"],
  ["Hand in Hand 1-6, Starter", "초등 종합영어", "Pre-A1-A2", ["유아", "초등저", "초등고"], "국내 시장 초등 종합영어, 스타터 포함"],
  ["Impact Values", "논픽션·시사 리딩", "A2-B1", ["초등고", "중등"], "인성·가치 주제 리딩·토론"],
  ["Insight Link", "논픽션·시사 리딩", "B1", ["초등고", "중등"], "교과연계형 논픽션 콘텐츠 리딩"],
  ["Junior Debate Club 1-2 (3권 누락)", "디베이트·스피치", "A2-B1", ["초등고", "중등"], "주니어 디베이트클럽, 3권 결번 확인 필요"],
  ["Let's Go", "초등 종합영어", "Pre-A1-A2", ["유아", "초등저", "초등고"], "Oxford 초등 종합영어 스테디셀러(스타터~6)"],
  ["Let's Talk", "성인 종합영어", "A2-B1", ["고등", "성인"], "Cambridge 성인 스피킹 중심 교재"],
  ["Let's Go Phonics", "파닉스", "Pre-A1", ["유아"], "Let's Go 계열 파닉스 입문"],
  ["My Best Reading 1-4", "그레이디드 리딩", "A1-A2", ["초등저", "초등고"], "기본 리딩 스킬 훈련"],
  ["My First English Discussion 1-2", "디베이트·스피치", "A2", ["초등고"], "첫 토론·의견말하기 입문"],
  ["My First Series", "유아 회화", "Pre-A1", ["유아"], "유아 첫걸음 영어 시리즈"],
  ["National Geographic Our World 2nd", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "내셔널지오그래픽 콘텐츠 기반 초등 종합영어"],
  ["National Geographic Readers", "논픽션·시사 리딩", "Pre-A1-B1", ["유아", "초등저", "초등고"], "레벨별 논픽션 리더스, 실사 사진 자료"],
  ["New Children's Talk", "유아 회화", "Pre-A1-A1", ["유아", "초등저"], "유아·초등저 회화 입문"],
  ["Nonfiction Reading Practice Grade 1-4", "논픽션·시사 리딩", "A1-B1", ["초등저", "초등고"], "미국 학년제 논픽션 리딩 연습"],
  ["Open to Debate", "디베이트·스피치", "B1-B2", ["중등", "고등"], "본격 디베이트 포맷, 찬반 논증"],
  ["Oxford Bright Ideas Class Book 1-5", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "Oxford 초등 종합영어"],
  ["Oxford Phonics World 1-5", "파닉스", "Pre-A1", ["유아", "초등저"], "체계적 파닉스 대표 시리즈"],
  ["Oxford Primary Skills 1-6 Reading and Writing", "라이팅", "A1-A2", ["초등저", "초등고"], "리딩·라이팅 스킬 통합 훈련"],
  ["Oxford Discover 1-6", "초등 종합영어", "A1-B1", ["초등저", "초등고"], "CLIL 기반 탐구형 초등 종합영어"],
  ["Phonics Party", "파닉스", "Pre-A1", ["유아"], "놀이 중심 파닉스 입문"],
  ["Primary Longman-Express", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "홍콩계 초등 종합영어"],
  ["Progressive Phonics 1-5", "파닉스", "Pre-A1", ["유아", "초등저"], "단계적 파닉스 훈련"],
  ["Read and Understand 1-4", "그레이디드 리딩", "A1-A2", ["초등저", "초등고"], "독해력 기초 훈련"],
  ["Reading Adventures 1-3", "그레이디드 리딩", "A1-A2", ["초등저", "초등고"], "흥미 위주 초등 리딩"],
  ["Reading Challenge 1-3", "그레이디드 리딩", "A2-B1", ["초등고", "중등"], "독해 난이도 상향 리딩"],
  ["Reading Expert 1-4 (5권 누락)", "그레이디드 리딩", "B1-B2", ["중등"], "중등 수준 독해력 심화, 5권 결번 확인 필요"],
  ["Reading Future Discover 1-3", "논픽션·시사 리딩", "B1", ["초등고", "중등"], "논픽션 콘텐츠 리딩, 교과연계형"],
  ["Reading Key Preschool 1~6", "파닉스", "Pre-A1-A1", ["유아", "초등저"], "국내 시장 대표 파닉스~초급 리딩 시리즈"],
  ["Reading Rocket 1-3", "그레이디드 리딩", "A1", ["초등저"], "초급 리딩 입문"],
  ["Reading Sketch Up 1-3", "그레이디드 리딩", "A1-A2", ["초등저", "초등고"], "초등 리딩 스킬 훈련"],
  ["Reading Sponge 1-3", "그레이디드 리딩", "A1", ["초등저"], "초급 리딩 흡수형 연습"],
  ["Reading Wise 1-3", "그레이디드 리딩", "A1-A2", ["초등저", "초등고"], "독해 전략 중심 리딩"],
  ["Reading Explorer Foundation-5", "논픽션·시사 리딩", "A2-C1", ["중등", "고등", "성인"], "Cengage 내셔널지오그래픽 콘텐츠, 전 레벨"],
  ["Reading for the Real World 1-3 4th Ed", "논픽션·시사 리딩", "B1-B2", ["중등", "고등"], "실전 독해, 시험 대비형"],
  ["Reading Starter 1-3", "그레이디드 리딩", "Pre-A1-A1", ["초등저"], "리딩 최초 입문"],
  ["Side by Side 1-4", "성인 종합영어", "A1-B1", ["고등", "성인"], "Pearson 문법-회화 통합 스테디셀러"],
  ["Smart Grammar and Vocabulary 1a,1b,2a", "문법", "A2-B1", ["중등"], "문법+어휘 통합 훈련"],
  ["Smart Phonics 1-5", "파닉스", "Pre-A1", ["유아"], "이퓨쳐 대표 파닉스 시리즈"],
  ["Sounds Great 1-5", "파닉스", "Pre-A1", ["유아", "초등저"], "발음·파닉스 통합 훈련"],
  ["Spark Times", "논픽션·시사 리딩", "B1-B2", ["중등", "고등"], "시사 이슈 리딩, 토론 연계 가능"],
  ["Speak Your Mind 1-2", "디베이트·스피치", "A2-B1", ["중등"], "의견 말하기 스피킹 훈련"],
  ["Speaking Pro 1-2", "디베이트·스피치", "B1", ["중등", "고등"], "본격 스피킹 실력 향상"],
  ["Speaking for Speeches 1-3", "디베이트·스피치", "B1-B2", ["중등", "고등"], "스피치 구성·전달 훈련"],
  ["Speech Like Me 1-4", "디베이트·스피치", "A2-B1", ["초등고", "중등"], "스피치 입문, 단계별 확장"],
  ["Story Books", "스토리북·그림책", "전 레벨", ["유아", "초등저", "초등고"], "레벨 혼합 스토리북 모음, 다독용"],
  ["Subject Link 1-5", "교과연계(CLIL)", "A2-B1", ["초등저", "초등고"], "과학·사회 등 교과 주제 연계 리딩"],
  ["Super Star Book 1-6", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "초등 종합영어"],
  ["SuperKids Student Book 1-4", "유아 회화", "Pre-A1-A1", ["유아", "초등저"], "미국 유치원식 종합영어, 챈트·활동 중심"],
  ["Talk Time 1-3", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "스피킹 중심 초등 종합영어"],
  ["Talking Talking! for Junior 1-2", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "주니어 회화 훈련"],
  ["Teen 2 Teen 1-4", "청소년 종합영어", "A1-B1", ["중등"], "Oxford 청소년 종합영어 대표 시리즈"],
  ["Teen Talk 1-2", "청소년 종합영어", "A2-B1", ["중등"], "청소년 생활회화"],
  ["The Express Picture Dictionary SB", "어휘", "Pre-A1", ["유아", "초등저"], "그림사전, 어휘 입문"],
  ["Time to Talk series Pre A1-B2", "성인 종합영어", "Pre-A1-B2", ["중등", "고등", "성인"], "레벨 명시형 스피킹 시리즈, 전 구간 커버"],
  ["Totally True 1-2", "그레이디드 리딩", "B1", ["중등"], "실화 기반 리딩"],
  ["Travel English", "ESP(비즈니스·여행·시험)", "A2-B1", ["중등", "고등", "성인"], "여행 상황별 실용회화"],
  ["Vocabulary in Use 4th Edition", "어휘", "A1-C1", ["중등", "고등", "성인"], "Cambridge 어휘 대표 시리즈, 전 레벨"],
  ["Vocabulary Workshop Series", "어휘", "B1-B2", ["중등", "고등"], "Sadlier 미국 학년제 어휘 시리즈"],
  ["What a World 1-3", "그레이디드 리딩", "B1", ["중등", "고등"], "Pearson 실화 기반 리딩"],
  ["What Do You Think 1-2", "디베이트·스피치", "A2-B1", ["중등"], "의견 말하기 회화"],
  ["World English - TED Talks", "성인 종합영어", "A2-C1", ["고등", "성인"], "내셔널지오그래픽 TED 콘텐츠 활용 성인 종합영어"],
  ["World Wonders 1-2", "청소년 종합영어", "A2-B1", ["중등", "고등"], "내셔널지오그래픽 청소년 종합영어"],
  ["Baisic Survival for Trip", "ESP(비즈니스·여행·시험)", "A1-A2", ["중등", "고등", "성인"], "여행 생존회화"],
  ["Chat Room for Teens 1-3", "청소년 종합영어", "A2-B1", ["중등"], "채팅형 상황 회화, 또래 소재"],
  ["Core Pattern 233", "성인 종합영어", "A1-A2", ["중등", "고등", "성인"], "필수 패턴 233개 회화"],
  ["First Step in Reading 1-2", "그레이디드 리딩", "Pre-A1-A1", ["초등저"], "리딩 최초 입문 단계"],
  ["Get Ready for First Grade Workbook", "유아 회화", "Pre-A1", ["유아"], "초등 입학 준비 워크북"],
  ["Hang Out 1-6", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "Compass 초등 종합영어"],
  ["Hip Hip Hooray 1-6", "초등 종합영어", "Pre-A1-A2", ["유아", "초등저", "초등고"], "Pearson 유아·초등 종합영어 대표 시리즈"],
  ["Interchange 1-2", "성인 종합영어", "A1-B1", ["고등", "성인"], "Cambridge 성인 종합영어 스테디셀러"],
  ["Jazz English (?)", "성인 종합영어", "A2-B1", ["고등", "성인"], "회화 교재 추정 — 출판사 확인 필요"],
  ["Oxford Reading Tree", "그레이디드 리딩", "Pre-A1-A2", ["유아", "초등저", "초등고"], "영국 국민 리더스, 레벨 세분화 최대 수준"],
  ["Performance Assessment 1-2", "ESP(비즈니스·여행·시험)", "A2-B1", ["초등고", "중등"], "단원별 평가·시험 대비"],
  ["Pre-Inter-Advanced Conversation", "성인 종합영어", "A2-B2", ["고등", "성인"], "Pre-Intermediate~Advanced 레벨별 회화 자료"],
  ["Smart Grammar and Vocabulary", "문법", "A2-B1", ["중등"], "위와 동일 시리즈(중복 폴더)"],
  ["Speech Contest 1-3", "디베이트·스피치", "A2-B1", ["초등고", "중등"], "스피치 대회 대비 훈련"],
  ["Talk Talk Talk", "초등 종합영어", "A1-A2", ["초등저", "초등고"], "스피킹 중심 회화"],
  ["Touchstone 1-4", "성인 종합영어", "A2-B1", ["고등", "성인"], "Cambridge 성인 종합영어, Interchange 자매편"],
  ["Unlock Reading and Writing 1-4", "라이팅", "A1-C1", ["고등", "성인"], "Cambridge 리딩·라이팅 통합, 전 레벨"],
  ["Unlock Reading, Writing and Critical Thinking", "라이팅", "B1-B2", ["고등", "성인"], "비판적 사고 기반 리딩·라이팅"],
  ["Wonderland Junior A, B", "유아 회화", "Pre-A1", ["유아"], "유아 종합영어 입문"],
  ["Wordly Wise 1-12 4th Edition", "어휘", "A1-B2", ["초등고", "중등", "고등"], "미국 학년제 어휘 시리즈(1~12학년 대응)"],
  ["영어회화 100일", "성인 종합영어", "A1-A2", ["고등", "성인"], "성인 일상회화 100일 완성 자료(PDF)"],
];

const RAW_GRAMMAR: RawEntry[] = [
  ["Basic English Grammar", "문법", "A1-A2", ["초등고", "중등"], "Azar 계열 기초 문법, 예문·연습 중심"],
  ["English Grammar for the Utterly Confused", "문법", "B1-B2", ["고등", "성인"], "성인 자습용 문법 레퍼런스, 개념 설명 위주"],
  ["English Code 1-4 Grammar Book", "문법", "A1-A2", ["초등저", "초등고"], "Pearson English Code 연계 문법 워크북"],
  ["Grammar Friends", "문법", "Pre-A1-A2", ["유아", "초등저", "초등고"], "Oxford 초등 문법 시리즈, 스토리 기반 도입"],
  ["Grammar in Use", "문법", "A2-C1", ["중등", "고등", "성인"], "Cambridge 대표 문법서(Essential/Intermediate/Advanced), 자기주도 학습형"],
  ["Grammar Ebook Level 1", "문법", "A1", ["초등저", "초등고"], "기초 문법 이북, 레벨 1"],
  ["Grammar Ebook Level 2", "문법", "A2", ["초등고", "중등"], "기초 문법 이북, 레벨 2"],
  ["Grammar Genius", "문법", "A1-A2", ["초등저", "초등고"], "초등 문법 연습 시리즈"],
  ["New Grammar Time 1-3", "문법", "Pre-A1-A2", ["유아", "초등저", "초등고"], "Pearson 초등 문법 시리즈 개정판"],
  ["Oxford Discover Grammar 1-6", "문법", "A1-B1", ["초등저", "초등고"], "Oxford Discover 연계 문법, 6단계 세분화"],
  ["Super Minds Super Grammar Practice Book", "문법", "A1-A2", ["초등저", "초등고"], "Cambridge Super Minds 연계 문법 연습"],
];

const RAW_READING: RawEntry[] = [
  ["Frog and Toad Are Friends", "원서·챕터북", "A2 (AR 2.9)", ["초등저"], "아놀드 로벨 고전 초기리더, 짧은 에피소드·쉬운 대화문"],
  ["Henry and Mudge (폴더)", "원서·챕터북", "A2 (AR 2.0-2.5)", ["초등저"], "미국 초기 챕터북 대표 시리즈, 반복 문형·통제 어휘"],
  ["Henry and Mudge (전권 zip)", "원서·챕터북", "A2 (AR 2.0-2.5)", ["초등저"], "Henry and Mudge 시리즈 전권 압축 자료"],
  ["Nate the Great", "원서·챕터북", "A2 (AR 2.0-2.5)", ["초등저"], "추리형 초기 챕터북, 짧은 문장·반복 패턴"],
  ["Judy Moody was in a Mood", "원서·챕터북", "B1 (AR 3.0-3.5)", ["초등저", "초등고"], "유머러스한 초등 챕터북, 감정 표현 어휘 풍부"],
  ["Matilda (Roald Dahl Original)", "원서·챕터북", "B1 (Lexile ~840L)", ["초등고"], "로알드 달 대표 아동문학, 완역 원문"],
  ["The Maze Runner (Book 1)", "원서·챕터북", "B1-B2 (Lexile ~770L)", ["중등", "고등"], "YA 디스토피아 소설, 빠른 전개·대화 중심"],
  ["The Hunger Games (Book 1)", "원서·챕터북", "B1-B2 (Lexile ~810L)", ["중등", "고등"], "YA 디스토피아 소설, 1인칭 서술"],
  ["The Giver (Lois Lowry)", "원서·챕터북", "B1-B2 (Lexile ~760L)", ["중등", "고등"], "디스토피아 고전, 학교 필독서로 다수 채택"],
  ["Animal Farm (George Orwell)", "원서·챕터북", "B2-C1 (Lexile ~1170L)", ["고등", "성인"], "정치 풍자 우화, 어휘는 평이하나 주제 함축적"],
  ["Lord of the Flies (William Golding)", "원서·챕터북", "B2 (Lexile ~770L, 주제 난이도 높음)", ["고등", "성인"], "고전 문학, 상징·주제 해석 난이도 높음"],
  ["To Kill a Mockingbird (Harper Lee)", "원서·챕터북", "B2-C1 (Lexile ~870L)", ["고등", "성인"], "미국 현대 고전, 방언·사회적 맥락 이해 필요"],
];

function levelKeyFromText(text: string): CEFRLevel {
  const t = text.toLowerCase();
  if (t.includes("b2+") || t.includes("c1")) return "b2plus";
  if (t.includes("b2")) return "b2";
  if (t.includes("b1")) return "b1";
  if (t.includes("a2")) return "a2";
  if (t.includes("a1") && !t.includes("pre-a1")) return "a1";
  return "pre-a1";
}

// mirrors the pre-validated filter logic from the source catalog: presence-tests
// each level label as a literal substring of the level text (not a full range
// expansion), so e.g. "A1-B1" matches filters for A1 or B1, not the A2 in between.
function levelKeysFromText(text: string): CEFRLevel[] {
  if (text.includes("전 레벨")) return [...LEVEL_ORDER];
  const found = LEVEL_ORDER.filter((k) => {
    if (k === "pre-a1") return /pre-a1/i.test(text);
    if (k === "a1") return /(^|[^-])a1(?!\d)/i.test(text) && !/pre-a1/i.test(text);
    if (k === "b2plus") return /b2\+|c1/i.test(text);
    return new RegExp(k, "i").test(text);
  });
  return found.length === 0 ? [levelKeyFromText(text)] : found;
}

// `category` retains its original Korean value — it is not display text,
// it is the stable lookup key into textbooks.json's `categories` dictionary
// (e.g. t("textbooks:categories." + category)). `note` is intentionally NOT
// stored here: notes are looked up by `name` into textbooks.json's `notes`
// dictionary instead, so the Korean note text from RawEntry is parsed but
// discarded in buildEntries().
export type TextbookEntry = {
  name: string;
  folder: Folder;
  category: string;
  levelText: string;
  levelKeys: CEFRLevel[];
  chipLevel: CEFRLevel;
  ages: AgeGroup[];
  unverified: boolean;
};

function buildEntries(raw: RawEntry[], folder: Folder): TextbookEntry[] {
  return raw.map(([name, category, levelText, ages]) => {
    const levelKeys = levelKeysFromText(levelText);
    return {
      name: name.replace(" (?)", ""),
      folder,
      category,
      levelText,
      levelKeys,
      chipLevel: levelKeys[0],
      ages,
      unverified: name.includes("(?)"),
    };
  });
}

export const TEXTBOOK_CATALOG: TextbookEntry[] = [
  ...buildEntries(RAW_CONVERSATION, "Conversation"),
  ...buildEntries(RAW_GRAMMAR, "Grammar"),
  ...buildEntries(RAW_READING, "Reading books"),
];

export const CATALOG_CATEGORIES = [...new Set(TEXTBOOK_CATALOG.map((b) => b.category))].sort(
  (a, b) => a.localeCompare(b, "ko"),
);
