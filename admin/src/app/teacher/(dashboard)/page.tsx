import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { appDayStart, appDayEnd } from "@/lib/appTime";

export default async function TeacherHomePage() {
  const teacher = await requireTeacher();

  // "오늘"은 서버 프로세스의 로컬 시간이 아니라 Asia/Seoul 기준으로 계산한다.
  const todayStart = appDayStart();
  const todayEnd = appDayEnd();

  const [todaySessions, unwrittenCount] = await Promise.all([
    prisma.classSession.count({
      where: { teacherId: teacher.id, scheduledAt: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.classSession.count({
      where: { teacherId: teacher.id, status: "COMPLETED", evaluation: null },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">안녕하세요, {teacher.realName} 강사님</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">오늘 수업</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{todaySessions}</p>
        </div>
        <Link
          href="/teacher/sessions?filter=unwritten"
          className="rounded-2xl border border-orange-200 bg-orange-50 p-5 transition hover:border-orange-300"
        >
          <p className="text-xs font-medium text-orange-700">미작성 평가서</p>
          <p className="mt-2 text-2xl font-bold text-orange-700">{unwrittenCount}</p>
        </Link>
      </div>
    </div>
  );
}
