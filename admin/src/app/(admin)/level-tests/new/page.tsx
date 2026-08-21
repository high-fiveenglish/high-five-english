import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { LevelTestCreateForm } from "./LevelTestCreateForm";

export default async function NewLevelTestPage() {
  const students = await prisma.student.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">레벨테스트 신청 등록</h1>
      <LevelTestCreateForm students={students.map((s) => ({ id: s.id, label: `${s.name} (${s.loginId})` }))} />
    </div>
  );
}
