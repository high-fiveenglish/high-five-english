import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { formatAppDateTimeSeconds } from "@/lib/appTime";
import type { AuditAction, RoleName } from "@/generated/prisma/client";

const PAGE_SIZE = 50;

const fmt = formatAppDateTimeSeconds;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; role?: string }>;
}) {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") notFound();

  const { page: pageRaw, action, role } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);

  const where = {
    ...(action ? { action: action as AuditAction } : {}),
    ...(role ? { actorRole: role as RoleName } : {}),
  };

  const [logs, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">Audit Log</h1>

      <form className="mb-4 flex flex-wrap gap-2 text-sm" action="/audit-log">
        <select name="role" defaultValue={role ?? ""} className="input w-auto">
          <option value="">전체 역할</option>
          <option value="ADMIN">ADMIN</option>
          <option value="MANAGER">MANAGER</option>
          <option value="TEACHER">TEACHER</option>
          <option value="STUDENT">STUDENT</option>
        </select>
        <select name="action" defaultValue={action ?? ""} className="input w-auto">
          <option value="">전체 action</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>
              {a.action}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          필터
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">시각</th>
              <th className="px-3 py-3">행위자</th>
              <th className="px-3 py-3">action</th>
              <th className="px-3 py-3">대상</th>
              <th className="px-3 py-3">설명</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5 text-slate-500">{fmt(log.createdAt)}</td>
                <td className="px-3 py-2.5">
                  {log.actorName ? (
                    <>
                      <span className="font-medium text-slate-900">{log.actorName}</span>
                      <span className="ml-1.5 text-xs text-slate-400">{log.actorRole}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{log.action}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-600">
                  {log.targetType ? `${log.targetType}${log.targetId ? `#${log.targetId}` : ""}` : "-"}
                </td>
                <td className="px-3 py-2.5 text-slate-500">{log.description ?? "-"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && (
            <a
              href={`/audit-log?page=${page - 1}${action ? `&action=${action}` : ""}${role ? `&role=${role}` : ""}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              이전
            </a>
          )}
          <span className="text-slate-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/audit-log?page=${page + 1}${action ? `&action=${action}` : ""}${role ? `&role=${role}` : ""}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              다음
            </a>
          )}
        </div>
      )}
    </div>
  );
}
