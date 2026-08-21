import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteLevelTest } from "./actions";
import { ProgressSelect } from "./ProgressSelect";
import { TeacherAssignSelect } from "./TeacherAssignSelect";

export default async function LevelTestsPage() {
  const [levelTests, teachers] = await Promise.all([
    prisma.levelTest.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { id: "desc" },
      include: { student: true, teacher: true },
    }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" } }),
  ]);

  const teacherOptions = teachers.map((t) => ({ id: t.id, label: t.realName }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">레벨테스트 신청/진행 관리</h1>
        <Link
          href="/level-tests/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 레벨테스트 신청 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">과목</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">신청일</th>
              <th className="px-4 py-3">테스트 예정일</th>
              <th className="px-4 py-3">담당 강사</th>
              <th className="px-4 py-3">진행 상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {levelTests.map((lt) => (
              <tr key={lt.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{lt.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{lt.subject ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{lt.classMethod ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{lt.appliedAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {lt.scheduledTestDate ? lt.scheduledTestDate.toISOString().slice(0, 10) : "-"}
                </td>
                <td className="px-4 py-3">
                  <TeacherAssignSelect id={lt.id} teacherId={lt.teacherId} teachers={teacherOptions} />
                </td>
                <td className="px-4 py-3">
                  <ProgressSelect id={lt.id} progressStatus={lt.progressStatus} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteLevelTest.bind(null, lt.id)} />
                </td>
              </tr>
            ))}
            {levelTests.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  등록된 레벨테스트 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
