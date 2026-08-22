import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { LevelTestForm } from "./LevelTestForm";

export default async function StudentLevelTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);

  const [student, teachers, previousLevelTest] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.teacher.findMany({
      where: { siteId: DEFAULT_SITE_ID, approvalStatus: "APPROVED" },
      orderBy: { realName: "asc" },
    }),
    prisma.levelTest.findFirst({
      where: { studentId },
      orderBy: { id: "desc" },
    }),
  ]);

  if (!student || student.deletedAt) notFound();

  return (
    <div>
      <Link href="/students" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 학생관리로
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">레벨테스트 신청 등록 — {student.name}</h1>
      <p className="mb-6 text-sm text-slate-500">학생관리에서 선택한 학생으로 자동 연결됩니다.</p>

      <LevelTestForm
        student={{
          id: student.id,
          loginId: student.loginId,
          name: student.name,
          landlinePhone: student.landlinePhone,
          mobilePhone: student.mobilePhone,
          email: student.email,
          teamsId: student.teamsId,
          kakaoId: student.kakaoId,
          preferredClassMethod: student.preferredClassMethod,
        }}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
        defaultEnglishLevel={previousLevelTest?.englishLevel ?? null}
        defaultAgeGroup={previousLevelTest?.ageGroup ?? null}
        defaultInterestTopic={previousLevelTest?.interestTopic ?? null}
      />
    </div>
  );
}
