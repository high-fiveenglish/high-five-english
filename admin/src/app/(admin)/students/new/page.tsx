import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { StudentCreateForm } from "./StudentCreateForm";

export default async function NewStudentPage() {
  const agents = await prisma.agent.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">학생 등록</h1>
      <StudentCreateForm agents={agents.map((a) => ({ id: a.id, name: a.name }))} />
    </div>
  );
}
