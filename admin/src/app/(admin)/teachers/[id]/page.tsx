import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TeacherEditForm } from "./TeacherEditForm";

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacher = await prisma.teacher.findUnique({
    where: { id: Number(id) },
    include: { rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });

  if (!teacher) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">강사 정보 수정 — {teacher.realName}</h1>
      <TeacherEditForm
        teacher={{
          id: teacher.id,
          realName: teacher.realName,
          nickname: teacher.nickname,
          nationality: teacher.nationality,
          email: teacher.email,
          approvalStatus: teacher.approvalStatus,
          currentRate: teacher.rates[0]?.ratePerUnit.toString() ?? null,
        }}
      />
    </div>
  );
}
