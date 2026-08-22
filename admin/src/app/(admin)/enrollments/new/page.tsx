import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { EnrollmentCreateForm } from "./EnrollmentCreateForm";

export default async function NewEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { studentId } = await searchParams;

  const [students, teachers] = await Promise.all([
    prisma.student.findMany({ where: { siteId: DEFAULT_SITE_ID, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" } }),
  ]);

  // 학생관리 목록의 "수강등록"에서 넘어온 경우 해당 학생이 미리 선택되고, 회원정보에
  // 저장된 희망 수업방법을 수업 방식 기본값으로 채워 관리자가 다시 입력하지 않아도 된다.
  const preselected = students.find((s) => s.id === Number(studentId));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">수강신청 등록</h1>
      <EnrollmentCreateForm
        students={students.map((s) => ({ id: s.id, label: `${s.name} (${s.loginId})` }))}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
        defaultStudentId={preselected?.id ?? null}
        defaultClassMethod={preselected?.preferredClassMethod ?? null}
      />
    </div>
  );
}
