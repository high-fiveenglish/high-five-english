import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function TeacherBulletinsPage() {
  const teacher = await requireTeacher();

  // 강사 본인의 site 범위 공지만 조회한다 — 다른 site의 공지가 섞이지 않도록 서버에서 제한.
  const bulletins = await prisma.bulletin.findMany({
    where: { siteId: teacher.siteId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">Bulletin Board</h1>

      <div className="flex flex-col gap-2">
        {bulletins.map((b) => (
          <Link
            key={b.id}
            href={`/teacher/bulletins/${b.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"
          >
            <p className="text-sm font-bold text-slate-900">{b.title}</p>
            <p className="mt-1 text-xs text-slate-500">{fmtDateTime(b.createdAt)}</p>
          </Link>
        ))}
        {bulletins.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
            No notices found.
          </p>
        )}
      </div>
    </div>
  );
}
