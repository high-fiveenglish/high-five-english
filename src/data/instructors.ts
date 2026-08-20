import type { MeetingPlatformId } from "./meetingPlatforms";

export type Instructor = {
  id: string;
  name: string;
  nameEn: string;
  country: string;
  flag: string;
  gradient: string;
  audioSrc: string;
  /** Pre-fills a new enrollment's meetingPlatform when an admin assigns this
   * teacher — informational default only, not read at runtime by student screens. */
  defaultMeetingPlatform?: MeetingPlatformId;
};

// NOTE: Photos are placeholder initials-avatars. Swap in real instructor
// headshots (and real recordings for audioSrc) once available.
// Bio copy (tags/intro/detail/career) lives in src/locales/{lang}/home.json under
// `instructors.bios.<id>`, keyed by the same id as below.
export const INSTRUCTORS: Instructor[] = [
  {
    id: "sarah",
    name: "사라",
    nameEn: "Sarah T.",
    country: "미국",
    flag: "🇺🇸",
    gradient: "from-brand-500 to-brand-700",
    audioSrc: "/audio/intro-1.wav",
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
  },
  {
    id: "emily",
    name: "에밀리",
    nameEn: "Emily R.",
    country: "영국",
    flag: "🇬🇧",
    gradient: "from-accent-400 to-accent-600",
    audioSrc: "/audio/intro-3.wav",
  },
  {
    id: "daniel",
    name: "다니엘",
    nameEn: "Daniel P.",
    country: "호주",
    flag: "🇦🇺",
    gradient: "from-brand-400 to-brand-600",
    audioSrc: "/audio/intro-4.wav",
  },
];
