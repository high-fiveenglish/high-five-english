import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { EnrollmentCreateForm } from "../../../enrollments/new/EnrollmentCreateForm";
import { parseRouteId } from "@/lib/routeId";
import { requirePageActor, requirePageInScope } from "@/lib/pageAccess";

export default async function StudentEnrollmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor("enrollments.create");
  const { id } = await params;
  const studentId = parseRouteId(id);
  if (studentId === null) notFound();
  // 협력사 계정은 자기 협력사 학생만 — 다른 협력사/본사 직영 학생의 id를 직접 입력하면 404
  await requirePageInScope(actor, "student", studentId);

  const [student, teachers] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" }, select: TEACHER_SUMMARY_SELECT }),
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
        studentName={student.name}
        defaultEnglishName={student.englishName}
        returnTo="/students?notice=enrollment-created"
      />
    </div>
  );
}
