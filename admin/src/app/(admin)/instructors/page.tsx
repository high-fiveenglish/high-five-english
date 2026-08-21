import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteInstructor } from "./actions";
import { MoveButtons } from "./MoveButtons";

export default async function InstructorsPage() {
  const instructors = await prisma.instructor.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { order: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">강사소개 관리</h1>
        <Link
          href="/instructors/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 강사 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">순서</th>
              <th className="px-4 py-3">사진</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">국가</th>
              <th className="px-4 py-3">공개 상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {instructors.map((i, idx) => (
              <tr key={i.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <MoveButtons id={i.id} isFirst={idx === 0} isLast={idx === instructors.length - 1} />
                </td>
                <td className="px-4 py-3">
                  {i.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.photoUrl} alt={i.name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-500">
                      {i.name.slice(0, 1)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/instructors/${i.id}`} className="font-medium text-slate-900 hover:underline">
                    {i.name} ({i.nameEn})
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {i.flag} {i.country}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      i.published ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {i.published ? "공개" : "비공개"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteInstructor.bind(null, i.id)} />
                </td>
              </tr>
            ))}
            {instructors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  등록된 강사가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
