import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { LevelTestCreateForm } from "./LevelTestCreateForm";

export default async function NewLevelTestPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const { studentId } = await searchParams;

  const students = await prisma.student.findMany({
    where: { siteId: DEFAULT_SITE_ID, deletedAt: null },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">레벨테스트 신청 등록</h1>
      <LevelTestCreateForm
        students={students.map((s) => ({
          id: s.id,
          label: `${s.name} (${s.loginId})`,
          landlinePhone: s.landlinePhone,
          mobilePhone: s.mobilePhone,
          email: s.email,
          teamsId: s.teamsId,
          kakaoId: s.kakaoId,
          wechatId: s.wechatId,
          preferredClassMethod: s.preferredClassMethod,
        }))}
        // 학생관리 목록의 "레벨테스트 등록"에서 넘어온 경우 해당 학생이 미리 선택된다.
        defaultStudentId={Number(studentId) || null}
      />
    </div>
  );
}
