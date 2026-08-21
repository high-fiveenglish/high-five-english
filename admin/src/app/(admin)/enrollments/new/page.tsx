import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { EnrollmentCreateForm } from "./EnrollmentCreateForm";

export default async function NewEnrollmentPage() {
  const [students, teachers] = await Promise.all([
    prisma.student.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { name: "asc" } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">수강신청 등록</h1>
      <EnrollmentCreateForm
        students={students.map((s) => ({ id: s.id, label: `${s.name} (${s.loginId})` }))}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
      />
    </div>
  );
}
