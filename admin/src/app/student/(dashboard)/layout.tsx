import type { ReactNode } from "react";
import Link from "next/link";
import { requireStudent } from "@/lib/studentAuth";
import { studentLogout } from "../actions";

export default async function StudentDashboardLayout({ children }: { children: ReactNode }) {
  const student = await requireStudent();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-slate-900">하이파이브 잉글리쉬</span>
          <nav className="flex gap-4 text-sm font-medium text-slate-600">
            <Link href="/student" className="hover:text-slate-900">
              홈
            </Link>
            <Link href="/student/sessions" className="hover:text-slate-900">
              내 수업
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{student.name} 학생님</span>
          <form action={studentLogout}>
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
