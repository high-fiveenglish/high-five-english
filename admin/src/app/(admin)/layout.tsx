import type { ReactNode } from "react";
import { NavLink } from "./NavLink";
import { logout } from "./actions";

const NAV_GROUPS = [
  {
    title: "대시보드",
    items: [{ href: "/", label: "홈" }],
  },
  {
    title: "회원 관리",
    items: [
      { href: "/students", label: "학생 관리" },
      { href: "/teachers", label: "강사 관리" },
    ],
  },
  {
    title: "수업 운영",
    items: [
      { href: "/enrollments", label: "수강신청 관리" },
      { href: "/schedule", label: "전체 일정표" },
      { href: "/evaluations", label: "일일평가서 관리" },
    ],
  },
  {
    title: "레벨테스트",
    items: [{ href: "/level-tests", label: "신청/진행 관리" }],
  },
  {
    title: "콘텐츠 관리",
    items: [
      { href: "/instructors", label: "강사소개 관리" },
      { href: "/pricing", label: "가격표 관리" },
    ],
  },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col gap-6 bg-slate-900 p-4">
        <div className="px-2 pt-2">
          <p className="text-sm font-bold text-white">하이파이브 잉글리쉬</p>
          <p className="text-xs text-slate-400">관리자</p>
        </div>

        <nav className="flex flex-1 flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} href={item.href} label={item.label} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            로그아웃
          </button>
        </form>
      </aside>

      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
