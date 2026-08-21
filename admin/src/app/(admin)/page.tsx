import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";

async function getCounts() {
  const [students, teachers, activeEnrollments, pendingLevelTests, todaySessions] =
    await Promise.all([
      prisma.student.count({ where: { siteId: DEFAULT_SITE_ID } }),
      prisma.teacher.count({ where: { siteId: DEFAULT_SITE_ID } }),
      prisma.enrollment.count({
        where: { siteId: DEFAULT_SITE_ID, status: { in: ["ACTIVE", "PAID"] } },
      }),
      prisma.levelTest.count({
        where: { siteId: DEFAULT_SITE_ID, progressStatus: { not: "완료" } },
      }),
      prisma.classSession.count({
        where: {
          siteId: DEFAULT_SITE_ID,
          scheduledAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(24, 0, 0, 0)),
          },
        },
      }),
    ]);

  return { students, teachers, activeEnrollments, pendingLevelTests, todaySessions };
}

const CARDS = [
  { key: "students", label: "학생 수" },
  { key: "teachers", label: "강사 수" },
  { key: "activeEnrollments", label: "진행중 수강" },
  { key: "pendingLevelTests", label: "진행중 레벨테스트" },
  { key: "todaySessions", label: "오늘 수업 건수" },
] as const;

export default async function DashboardPage() {
  const counts = await getCounts();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">대시보드</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((card) => (
          <div key={card.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{counts[card.key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
