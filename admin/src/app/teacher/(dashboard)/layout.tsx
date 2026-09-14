import type { ReactNode } from "react";
import Link from "next/link";
import { requireTeacher, isImpersonatingTeacher } from "@/lib/teacherAuth";
import { teacherLogout } from "../actions";
import { ImpersonationBanner } from "./ImpersonationBanner";

export default async function TeacherDashboardLayout({ children }: { children: ReactNode }) {
  const [teacher, impersonating] = await Promise.all([requireTeacher(), isImpersonatingTeacher()]);

  return (
    <div className="min-h-screen bg-slate-100">
      {impersonating && <ImpersonationBanner teacherName={teacher.realName} />}
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          <span className="shrink-0 text-sm font-bold text-slate-900">하이파이브 잉글리쉬 강사</span>
          <nav className="flex gap-4 overflow-x-auto text-sm font-medium text-slate-600">
            <Link href="/teacher" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Home
            </Link>
            <Link href="/teacher/schedule" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Schedule
            </Link>
            <Link href="/teacher/hold" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Hold Management
            </Link>
            <Link href="/teacher/monthly-evaluations" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Monthly Evaluations
            </Link>
            <Link href="/teacher/bulletins" className="shrink-0 whitespace-nowrap hover:text-slate-900">
              Bulletin Board
            </Link>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm text-slate-500">{teacher.realName} · Teacher</span>
          <form action={teacherLogout}>
            <button type="submit" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="p-8">{children}</main>
    </div>
  );
}
