import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StudentEditForm } from "./StudentEditForm";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await prisma.student.findUnique({ where: { id: Number(id) } });

  if (!student) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">학생 정보 수정 — {student.name}</h1>
      <StudentEditForm
        student={{
          id: student.id,
          name: student.name,
          loginId: student.loginId,
          grade: student.grade,
          status: student.status,
          points: student.points,
          discountRate: student.discountRate.toString(),
        }}
      />
    </div>
  );
}
