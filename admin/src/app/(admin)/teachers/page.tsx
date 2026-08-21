import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteTeacher } from "./actions";

const APPROVAL_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려",
};

export default async function TeachersPage() {
  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { id: "desc" },
    include: { rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">강사 관리</h1>
        <Link
          href="/teachers/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 강사 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">실명</th>
              <th className="px-4 py-3">닉네임</th>
              <th className="px-4 py-3">로그인 ID</th>
              <th className="px-4 py-3">국적</th>
              <th className="px-4 py-3">승인 상태</th>
              <th className="px-4 py-3">현재 단가(25분)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/teachers/${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {t.realName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{t.nickname ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{t.loginId}</td>
                <td className="px-4 py-3 text-slate-600">{t.nationality ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{APPROVAL_LABEL[t.approvalStatus]}</td>
                <td className="px-4 py-3 text-slate-600">
                  {t.rates[0] ? `${t.rates[0].ratePerUnit.toString()}원` : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteTeacher.bind(null, t.id)} />
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
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
