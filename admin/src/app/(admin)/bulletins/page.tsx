import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteBulletin } from "./actions";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function BulletinsPage() {
  const bulletins = await prisma.bulletin.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">공지사항 관리</h1>
        <Link
          href="/bulletins/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 공지 작성
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3">작성일</th>
              <th className="px-4 py-3">수정일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {bulletins.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/bulletins/${b.id}`} className="font-medium text-slate-900 hover:underline">
                    {b.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(b.createdAt)}</td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(b.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteBulletin.bind(null, b.id)} />
                </td>
              </tr>
            ))}
            {bulletins.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  등록된 공지사항이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
