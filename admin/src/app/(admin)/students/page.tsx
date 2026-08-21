import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteStudent } from "./actions";

const GRADE_LABEL: Record<string, string> = {
  ADMIN: "관리자",
  AGENT: "협력사",
  BRANCH: "지점",
  GENERAL: "일반",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활동중",
  EXPIRED: "만료",
  HOLDING: "홀드",
};

export default async function StudentsPage() {
  const students = await prisma.student.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { id: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">학생 관리</h1>
        <Link
          href="/students/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 학생 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">로그인 ID</th>
              <th className="px-4 py-3">등급</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">포인트</th>
              <th className="px-4 py-3">할인율</th>
              <th className="px-4 py-3">가입일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/students/${s.id}`} className="font-medium text-slate-900 hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{s.loginId}</td>
                <td className="px-4 py-3 text-slate-600">{GRADE_LABEL[s.grade]}</td>
                <td className="px-4 py-3 text-slate-600">{STATUS_LABEL[s.status]}</td>
                <td className="px-4 py-3 text-slate-600">{s.points}</td>
                <td className="px-4 py-3 text-slate-600">{s.discountRate.toString()}%</td>
                <td className="px-4 py-3 text-slate-500">
                  {s.joinedAt.toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteStudent.bind(null, s.id)} />
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  등록된 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
