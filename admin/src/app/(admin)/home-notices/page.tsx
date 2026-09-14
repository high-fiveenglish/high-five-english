import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteHomeNotice } from "./actions";
import { formatAppDateTime } from "@/lib/appTime";

export default async function HomeNoticesPage() {
  const notices = await prisma.homeNotice.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">홈페이지 공지 관리</h1>
          <p className="mt-1 text-sm text-slate-500">마케팅 사이트 메인 화면에 노출되는 공지입니다. 게시 체크가 없으면 노출되지 않습니다.</p>
        </div>
        <Link
          href="/home-notices/new"
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
              <th className="px-4 py-3">게시상태</th>
              <th className="px-4 py-3">조회수</th>
              <th className="px-4 py-3">작성일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => (
              <tr key={n.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/home-notices/${n.id}`} className="font-medium text-slate-900 hover:underline">
                    {n.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      n.published ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {n.published ? "게시중" : "비공개"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{n.views}</td>
                <td className="px-4 py-3 text-slate-500">{formatAppDateTime(n.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteHomeNotice.bind(null, n.id)} />
                </td>
              </tr>
            ))}
            {notices.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
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
