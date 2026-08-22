import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { MonthlyEvaluationCreateForm } from "./MonthlyEvaluationCreateForm";

export default async function NewMonthlyEvaluationPage() {
  const [students, teachers] = await Promise.all([
    prisma.student.findMany({ where: { siteId: DEFAULT_SITE_ID, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">월평가서 작성</h1>
      <MonthlyEvaluationCreateForm
        students={students.map((s) => ({ id: s.id, label: `${s.name} (${s.loginId})` }))}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
      />
    </div>
  );
}
