import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function TeacherBulletinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const teacher = await requireTeacher();
  const { id } = await params;

  const bulletin = await prisma.bulletin.findUnique({ where: { id: Number(id) } });
  // URL의 id만 믿지 않고, 강사 본인의 site 범위가 아니면 접근을 막는다.
  if (!bulletin || bulletin.siteId !== teacher.siteId) notFound();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">{bulletin.title}</h1>
      <p className="mb-6 text-xs text-slate-500">{fmtDateTime(bulletin.createdAt)}</p>
      <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
        {bulletin.content}
      </div>
    </div>
  );
}
