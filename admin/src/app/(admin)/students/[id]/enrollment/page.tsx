import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { EnrollmentCreateForm } from "../../../enrollments/new/EnrollmentCreateForm";

export default async function StudentEnrollmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);

  const [student, teachers] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" } }),
  ]);

  if (!student || student.deletedAt) notFound();

  return (
    <div>
      <Link href="/students" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 학생관리로
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">수강신청 등록 — {student.name}</h1>
      <p className="mb-6 text-sm text-slate-500">학생관리에서 선택한 학생으로 자동 연결됩니다.</p>

      <EnrollmentCreateForm
        students={[]}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
        defaultStudentId={student.id}
        defaultClassMethod={student.preferredClassMethod}
        lockStudent
        studentLabel={`${student.loginId} (${student.name})`}
      />
    </div>
  );
}
