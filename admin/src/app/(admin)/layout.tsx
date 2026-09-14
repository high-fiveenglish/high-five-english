import type { ReactNode } from "react";
import { NavLink } from "./NavLink";
import { logout } from "./actions";
import { requireBackofficeActor } from "@/lib/backofficeAuth";

// permission이 없으면 로그인한 ADMIN/MANAGER 모두에게 항상 보인다. permission이 있으면
// ADMIN은 항상 통과하고, MANAGER는 실제로 그 view 권한을 가졌을 때만 링크가 보인다 —
// 메뉴 숨김은 UX 편의일 뿐이며 실제 접근 차단은 각 페이지/서버 액션이 담당한다.
const NAV_GROUPS = [
  {
    title: "대시보드",
    items: [{ href: "/", label: "홈", permission: null }],
  },
  {
    title: "회원 관리",
    items: [
      { href: "/students", label: "학생 관리", permission: "students.view" },
      { href: "/teachers", label: "강사 관리", permission: "teachers.view" },
    ],
  },
  {
    title: "레벨테스트",
    items: [{ href: "/level-tests", label: "신청/진행 관리", permission: "level_tests.view" }],
  },
  {
    title: "수강내역관리",
    items: [
      { href: "/enrollments", label: "수강내역관리", permission: "enrollments.view" },
      { href: "/deleted-sessions", label: "수업 삭제 내역", permission: "schedules.view" },
      { href: "/overlapping-sessions", label: "겹치는 수업 내역", permission: "schedules.view" },
      { href: "/evaluations", label: "일일평가서 관리", permission: "evaluations.view" },
      { href: "/monthly-evaluations", label: "월평가서 관리", permission: "monthly_evaluations.view" },
    ],
  },
  {
    title: "수업 운영",
    items: [
      { href: "/schedule", label: "전체 일정표", permission: "schedules.view" },
      { href: "/leave-requests", label: "휴강 관리", permission: "leave_requests.view" },
    ],
  },
  {
    title: "강사페이지 관리",
    items: [
      { href: "/pricing", label: "가격표 관리", permission: "pricing.view" },
      { href: "/bulletins", label: "공지사항 관리", permission: "bulletins.view" },
    ],
  },
  {
    title: "메인 사이트 관리",
    items: [
      { href: "/home-notices", label: "홈페이지 공지 관리", permission: "home_notices.view" },
      { href: "/reviews", label: "수강후기 게시판", permission: "reviews.view" },
      { href: "/consult-channels", label: "상담채널 설정", permission: "consult_channels.view" },
    ],
  },
] as const;

// ADMIN에게만 보이는 그룹 — role을 직접 확인하며, 권한 테이블과 무관하게 항상
// ADMIN에게만 노출된다(계정관리/권한관리/Audit Log 페이지 자체도 서버에서 동일하게 확인).
const ADMIN_ONLY_GROUP = {
  title: "시스템 관리",
  items: [
    { href: "/accounts", label: "계정 관리" },
    { href: "/permissions", label: "권한 관리" },
    { href: "/audit-log", label: "Audit Log" },
  ],
} as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireBackofficeActor();
  const isAdmin = actor.role === "ADMIN";
  const marketingSiteUrl = process.env.MARKETING_SITE_URL ?? "http://localhost:5173";
  const hasPermission = (key: string | null) => key === null || isAdmin || ("permissions" in actor && actor.permissions.includes(key));

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col gap-6 bg-slate-900 p-4">
        <div className="px-2 pt-2">
          <p className="text-sm font-bold text-white">하이파이브 잉글리쉬</p>
          <p className="text-xs text-slate-400">
            {actor.name} · {actor.role}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {visibleGroups.map((group) => (
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
          {isAdmin && (
            <div key={ADMIN_ONLY_GROUP.title}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {ADMIN_ONLY_GROUP.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {ADMIN_ONLY_GROUP.items.map((item) => (
                  <NavLink key={item.href} href={item.href} label={item.label} />
                ))}
              </div>
            </div>
          )}
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

      <main className="flex flex-1 flex-col overflow-x-auto">
        <header className="flex items-center justify-end gap-2 border-b border-slate-200 bg-white px-8 py-3">
          <a
            href={marketingSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            홈페이지 메인
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              로그아웃
            </button>
          </form>
        </header>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}
