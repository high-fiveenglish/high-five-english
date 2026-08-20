export type NavChild = {
  label: string;
  href: string;
  scrollTo?: string;
  description?: string;
};

export type NavItem = {
  label: string;
  href?: string;
  scrollTo?: string;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "회사소개",
    href: "/about",
  },
  {
    label: "화상영어 소개",
    href: "/program",
  },
  {
    label: "프로그램 설치",
    href: "/install",
    children: [
      { label: "Zoom 설치 안내", href: "/install", scrollTo: "zoom" },
      { label: "VooV Meeting 설치 안내", href: "/install", scrollTo: "voov" },
      { label: "Microsoft Teams 설치 안내", href: "/install", scrollTo: "teams" },
    ],
  },
  {
    label: "커리큘럼",
    href: "/curriculum",
  },
  {
    label: "수강안내",
    children: [
      { label: "수강료 안내", href: "/", scrollTo: "pricing" },
      { label: "수강절차", href: "/process" },
    ],
  },
  {
    label: "강사소개",
    href: "/",
    scrollTo: "instructors",
  },
  {
    label: "학습시스템",
    href: "/",
    scrollTo: "learning-system",
    children: [
      { label: "내 강의실", href: "/classroom" },
      { label: "학습평가서", href: "/classroom" },
      { label: "매월 레벨평가", href: "/", scrollTo: "learning-system" },
    ],
  },
  {
    label: "고객센터",
    children: [
      { label: "공지사항", href: "/notice" },
      { label: "수강후기", href: "/", scrollTo: "reviews" },
      { label: "1:1 상담", href: "/counsel" },
    ],
  },
];
