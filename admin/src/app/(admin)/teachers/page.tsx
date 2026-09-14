import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { DeleteButton } from "../DeleteButton";
import { deleteTeacher } from "./actions";
import { AccountStatusSelect } from "./AccountStatusSelect";
import { ImpersonateButton } from "./ImpersonateButton";

const APPROVAL_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려",
};

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showInactive = filter === "inactive";

  const teachers = await prisma.teacher.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      accountStatus: showInactive ? { not: "ACTIVE" } : "ACTIVE",
    },
    orderBy: { id: "desc" },
    select: { ...TEACHER_SUMMARY_SELECT, rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
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

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/teachers"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            !showInactive ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          활성 강사
        </Link>
        <Link
          href="/teachers?filter=inactive"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            showInactive ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          비활성/정지 강사
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">실명</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">닉네임</th>
              <th className="px-4 py-3">로그인 ID</th>
              <th className="px-4 py-3">국적</th>
              <th className="px-4 py-3">승인 상태</th>
              <th className="px-4 py-3">계정 상태</th>
              <th className="px-4 py-3">현재 단가(25분)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{t.realName}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/teachers/${t.id}`}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    수정
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{t.nickname ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{t.loginId}</td>
                <td className="px-4 py-3 text-slate-600">{t.nationality ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{APPROVAL_LABEL[t.approvalStatus]}</td>
                <td className="px-4 py-3">
                  <AccountStatusSelect teacherId={t.id} accountStatus={t.accountStatus} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {t.rates[0] ? `₱${t.rates[0].ratePerUnit.toString()}` : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {t.accountStatus === "ACTIVE" && (
                      <ImpersonateButton teacherId={t.id} teacherName={t.realName} />
                    )}
                    {!showInactive && <DeleteButton action={deleteTeacher.bind(null, t.id)} />}
                  </div>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  {showInactive ? "비활성/정지 상태인 강사가 없습니다." : "등록된 강사가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
