export type ProcessStep = {
  step: number;
  title: string;
  icon:
    | "UserPlus"
    | "ClipboardList"
    | "Video"
    | "FileCheck2"
    | "MessageCircle"
    | "CreditCard"
    | "CalendarCheck"
    | "GraduationCap";
  desc: string;
  bullets?: string[];
  note?: string;
};

export const FLOW_LABELS = [
  "무료 회원가입",
  "레벨테스트 신청",
  "무료 테스트 & 체험수업",
  "결과 확인",
  "수강 상담",
  "수강료 결제",
  "스케줄 확인",
  "정규수업 시작",
];

export const PROCESS_STEPS: ProcessStep[] = [
  {
    step: 1,
    title: "무료 회원가입",
    icon: "UserPlus",
    desc: "레벨테스트 신청을 위해 먼저 무료로 회원가입을 진행합니다. 별도 비용은 전혀 발생하지 않아요.",
  },
  {
    step: 2,
    title: "레벨테스트 신청",
    icon: "ClipboardList",
    desc: "희망 날짜·시간과 학습 목적, 원하는 과정을 입력하면 신청이 완료됩니다. 신청 후 1~2일 이내 학습매니저가 직접 연락드려 일정을 확정하고, 이 과정에서 수업 방향까지 함께 상담해드립니다.",
    bullets: ["수업 시간", "수업 횟수", "교재", "수업 방식", "추천 과정"],
    note: "단순히 테스트 시간만 예약하는 게 아니라, 처음부터 나에게 맞는 수업 방향을 함께 찾아갑니다.",
  },
  {
    step: 3,
    title: "무료 테스트 & 체험수업",
    icon: "Video",
    desc: "예약한 시간에 실제 수업을 진행할 강사와 레벨테스트 겸 체험수업을 진행합니다. 시험이라기보다, 실제 수업을 미리 경험해보며 내 수준과 수업 방식이 나에게 맞는지 확인하는 시간입니다.",
  },
  {
    step: 4,
    title: "결과 확인",
    icon: "FileCheck2",
    desc: "레벨테스트 후 1일 이내 마이페이지에서 결과를 확인할 수 있습니다. 단순한 점수가 아니라, 현재 수준과 앞으로 보완하면 좋을 부분까지 함께 안내해드립니다.",
  },
  {
    step: 5,
    title: "수강 상담",
    icon: "MessageCircle",
    desc: "결과를 확인한 후 학습매니저와 상담하며 나에게 맞는 과정을 함께 결정합니다. 이 단계에서 수강을 강요하지 않습니다 — 충분히 확인하신 뒤 편하게 결정하시면 됩니다.",
    bullets: ["추천 과정", "수업 시간", "수업 횟수", "교재", "수업 방식"],
  },
  {
    step: 6,
    title: "수강료 결제",
    icon: "CreditCard",
    desc: "수업 시간과 과정이 최종 확정되면 수업 시작 전까지 수강료를 결제합니다. 결제가 완료되면 정해진 일정에 따라 정규수업이 시작됩니다.",
  },
  {
    step: 7,
    title: "스케줄 확인",
    icon: "CalendarCheck",
    desc: "마이페이지에서 수업 요일·시간, 담당 강사, 수업 과정을 확인할 수 있습니다. 수업 시작 전 미리 수업 환경을 점검하고 준비해보세요.",
    bullets: ["수업 요일", "수업 시간", "담당 강사", "수업 과정"],
  },
  {
    step: 8,
    title: "정규수업 시작",
    icon: "GraduationCap",
    desc: "정해진 날짜와 시간에 맞춰 수업이 시작됩니다. 원활한 수업을 위해 시작 5분 전까지 미리 접속해 대기해주세요. 이제 테스트가 아닌, 진짜 학습이 시작됩니다.",
  },
];
