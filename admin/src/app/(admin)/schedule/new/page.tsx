import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { ClassSessionCreateForm } from "./ClassSessionCreateForm";

export default async function NewClassSessionPage() {
  const enrollments = await prisma.enrollment.findMany({
    where: { siteId: DEFAULT_SITE_ID, teacherId: { not: null } },
    orderBy: { id: "desc" },
    include: { student: true, teacher: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">수업 등록</h1>
      <ClassSessionCreateForm
        enrollments={enrollments.map((e) => ({
          id: e.id,
          label: `${e.student.name} · ${e.teacher?.realName} (${e.scheduleDays})`,
        }))}
      />
    </div>
  );
}
