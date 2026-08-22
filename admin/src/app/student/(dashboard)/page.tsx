import { prisma } from "@/lib/prisma";
import { requireStudent } from "@/lib/studentAuth";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function StudentHomePage() {
  const student = await requireStudent();

  const [upcomingCount, enrollments] = await Promise.all([
    prisma.classSession.count({
      where: { studentId: student.id, status: "SCHEDULED", scheduledAt: { gte: new Date() } },
    }),
    prisma.enrollment.findMany({
      where: { studentId: student.id, status: { notIn: ["LOST"] } },
      include: { teacher: true },
      orderBy: { endDate: "desc" },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">안녕하세요, {student.name} 학생님</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">예정된 수업</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{upcomingCount}</p>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-700">수강 중인 과정</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">요일</th>
              <th className="px-4 py-3">총 회차</th>
              <th className="px-4 py-3">수강 기간</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{e.teacher?.realName ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">{e.scheduleDays}</td>
                <td className="px-4 py-3 text-slate-600">{e.totalSessions}회</td>
                <td className="px-4 py-3 text-slate-500">
                  {fmtDate(e.startDate)} ~ {fmtDate(e.endDate)}
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  수강 중인 과정이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
