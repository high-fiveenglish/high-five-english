// 관리자 레벨테스트 신청 폼(학생관리 → 레벨테스트 등록)의 선택지 — 단일 출처.
// 값은 전부 문자열로 저장되므로(LevelTest.subject/classMethod/englishLevel/ageGroup/
// interestTopic) 운영 중 항목을 추가/변경해도 이 파일만 고치면 되고, 이후 별도 관리
// 테이블로 승격할 때도 값 그대로 옮길 수 있다.

export const SUBJECT_OPTIONS = [{ value: "online_english", label: "온라인영어" }] as const;

// 레벨테스트관리(level-tests) 목록/상세 화면의 진행상태: 접수(신청 직후, 기본값) →
// 수업확정(상세 화면에서 담당강사+일시를 확정하는 행위의 결과로만 정해짐 — 별도
// 라디오/드롭다운으로 직접 고르지 않는다) → 수업완료/결석/취소(강사가 테스트 진행
// 후 평가하거나 결석 처리한 결과, 확정 화면의 버튼으로 처리). 종결 상태(더 이상
// "진행중"으로 치지 않는 상태)는 아래 TERMINAL_PROGRESS_STATUSES — 그 값 자체가
// 곧 이 워크플로우가 허용하는 전체 진행상태 목록이기도 하다.
export const TERMINAL_PROGRESS_STATUSES = ["수업완료", "결석", "취소"] as const;

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

// 레벨테스트 문제(관심분야) — 강사가 이 주제로 실제 대화 내용을 구성하므로, 연령대에
// 맞지 않는 항목(예: 초등학생에게 "시사·사회 이슈")이 섞이지 않도록 연령대별로 분리해
// 관리한다. AGE_GROUP_TO_TOPIC_GROUP으로 AGE_GROUP_OPTIONS의 값과 연결한다.
export const INTEREST_TOPIC_GROUPS = {
  kids: [
    { value: "animals_pets", label: "동물/펫" },
    { value: "school_life_friends", label: "학교생활/친구" },
    { value: "cartoons_games", label: "만화·게임" },
    { value: "family_home", label: "가족/집" },
    { value: "food_snacks", label: "음식/간식" },
    { value: "hobbies_play", label: "취미·놀이" },
    { value: "seasons_weather", label: "계절/날씨" },
    { value: "colors_shapes", label: "색깔/모양" },
    { value: "stories_fairytales", label: "동화·이야기" },
    { value: "sports_playground", label: "운동/놀이터" },
  ],
  teen: [
    { value: "school_exams_career", label: "학교·시험/진로" },
    { value: "kpop_movies_dramas", label: "K-pop·영화·드라마" },
    { value: "friends_sns", label: "친구·SNS" },
    { value: "sports", label: "스포츠" },
    { value: "travel", label: "여행" },
    { value: "hobbies", label: "취미" },
    { value: "part_time_job", label: "아르바이트" },
    { value: "youtube_internet_culture", label: "유튜브·인터넷 문화" },
    { value: "future_career", label: "미래 희망 직업" },
    { value: "clubs_activities", label: "동아리·방과후 활동" },
  ],
  adult: [
    { value: "career_work", label: "직장·커리어" },
    { value: "travel_culture", label: "여행/문화" },
    { value: "current_affairs", label: "시사·사회 이슈" },
    { value: "business_economy", label: "비즈니스/경제" },
    { value: "health_lifestyle", label: "건강/라이프스타일" },
    { value: "hobbies_self_development", label: "취미·자기계발" },
    { value: "parenting_family", label: "육아/가족" },
    { value: "investment_finance", label: "재테크/투자" },
    { value: "tech_trends", label: "IT·기술 트렌드" },
    { value: "relationships", label: "인간관계" },
  ],
} as const;

export type InterestTopicGroupKey = keyof typeof INTEREST_TOPIC_GROUPS;

// AGE_GROUP_OPTIONS(5단계)를 위 3개 관심분야 그룹으로 매핑한다.
export const AGE_GROUP_TO_TOPIC_GROUP: Record<string, InterestTopicGroupKey> = {
  elementary_low: "kids",
  elementary_high: "kids",
  middle: "teen",
  high: "teen",
  adult: "adult",
};

export const ALL_INTEREST_TOPIC_OPTIONS = [
  ...INTEREST_TOPIC_GROUPS.kids,
  ...INTEREST_TOPIC_GROUPS.teen,
  ...INTEREST_TOPIC_GROUPS.adult,
];
