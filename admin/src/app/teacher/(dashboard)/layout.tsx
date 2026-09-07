import type { ReactNode } from "react";
import Link from "next/link";
import { requireTeacher } from "@/lib/teacherAuth";
import { teacherLogout } from "../actions";

export default async function TeacherDashboardLayout({ children }: { children: ReactNode }) {
  const teacher = await requireTeacher();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          <span className="shrink-0 text-sm font-bold text-slate-900">하이파이브 잉글리쉬 강사</span>
          <nav className="flex gap-4 overflow-x-auto text-sm font-medium text-slate-600">
            <Link href="/teacher" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              홈
            </Link>
            <Link href="/teacher/schedule" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Schedule
            </Link>
            <Link href="/teacher/sessions" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              My Classes
            </Link>
            <Link href="/teacher/hold" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Hold Management
            </Link>
            <Link href="/teacher/bulletins" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Bulletin Board
            </Link>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-slate-500">{teacher.realName} 강사님</span>
          <form action={teacherLogout}>
            <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <main className="p-8">{children}</main>
    </div>
  );
}
