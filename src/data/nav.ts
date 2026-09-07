// `labelKey` looks up the display label from the "common" i18next namespace
// (src/locales/{lang}/common.json → nav.*) instead of hardcoding Korean text — see
// src/components/layout/{MainNav,MobileMenu,Footer}.tsx for where it's rendered via t().
export type NavChild = {
  labelKey: string;
  href: string;
  scrollTo?: string;
  description?: string;
};

export type NavItem = {
  labelKey: string;
  href?: string;
  scrollTo?: string;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    labelKey: "nav.about",
    href: "/about",
  },
  {
    labelKey: "nav.program",
    href: "/program",
  },
  {
    labelKey: "nav.install",
    href: "/install",
    children: [
      { labelKey: "nav.install_zoom", href: "/install", scrollTo: "zoom" },
      { labelKey: "nav.install_voov", href: "/install", scrollTo: "voov" },
      { labelKey: "nav.install_teams", href: "/install", scrollTo: "teams" },
    ],
  },
  {
    labelKey: "nav.curriculum",
    href: "/curriculum",
  },
  {
    labelKey: "nav.enrollment_guide",
    children: [
      { labelKey: "nav.pricing", href: "/", scrollTo: "pricing" },
      { labelKey: "nav.process", href: "/process" },
    ],
  },
  {
    labelKey: "nav.instructors",
    href: "/",
    scrollTo: "instructors",
  },
  {
    labelKey: "nav.learning_system",
    href: "/",
    scrollTo: "learning-system",
    children: [
      { labelKey: "nav.my_classroom", href: "/classroom" },
      { labelKey: "nav.evaluations", href: "/classroom" },
      { labelKey: "nav.monthly_level_test", href: "/", scrollTo: "learning-system" },
    ],
  },
  {
    labelKey: "nav.customer_center",
    children: [
      { labelKey: "nav.notice", href: "/", scrollTo: "notices" },
      { labelKey: "nav.reviews", href: "/", scrollTo: "reviews" },
      { labelKey: "nav.counsel", href: "/counsel" },
    ],
  },
];
