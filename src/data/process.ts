export type ProcessStep = {
  step: number;
  icon:
    | "UserPlus"
    | "ClipboardList"
    | "Video"
    | "FileCheck2"
    | "MessageCircle"
    | "CreditCard"
    | "CalendarCheck"
    | "GraduationCap";
  hasBullets?: boolean;
  hasNote?: boolean;
};

export const PROCESS_STEPS: ProcessStep[] = [
  {
    step: 1,
    icon: "UserPlus",
  },
  {
    step: 2,
    icon: "ClipboardList",
    hasBullets: true,
    hasNote: true,
  },
  {
    step: 3,
    icon: "Video",
  },
  {
    step: 4,
    icon: "FileCheck2",
  },
  {
    step: 5,
    icon: "MessageCircle",
    hasBullets: true,
  },
  {
    step: 6,
    icon: "CreditCard",
  },
  {
    step: 7,
    icon: "CalendarCheck",
    hasBullets: true,
  },
  {
    step: 8,
    icon: "GraduationCap",
  },
];
