import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { RoleSelect } from "./RoleSelect";
import { StatusSelect } from "./StatusSelect";
import { formatAppDateTime } from "@/lib/appTime";

export default async function AccountsPage() {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") notFound();

  const accounts = await prisma.adminUser.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { id: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">계정 관리</h1>
        <Link
          href="/accounts/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 계정 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">로그인 ID</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">최근 로그인</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                <td className="px-4 py-3 text-slate-600">{a.loginId}</td>
                <td className="px-4 py-3">
                  <RoleSelect id={a.id} role={a.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusSelect id={a.id} status={a.status} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {a.lastLoginAt ? formatAppDateTime(a.lastLoginAt) : "-"}
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  등록된 계정이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
