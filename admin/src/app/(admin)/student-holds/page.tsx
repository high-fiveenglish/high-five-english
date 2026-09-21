import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission } from "@/lib/rbac";
import { formatAppDate } from "@/lib/appTime";
import { updateEnrollmentStatus } from "../enrollments/actions";
import { HoldReleaseButton } from "./HoldReleaseButton";

// 협력사 관리자(AGENT)가 자기 협력사 수강생 중 "홀드" 상태인 건만 모아서 보고, 해제할
// 수 있게 하는 화면 — 홀드/해제 로직 자체는 수강내역관리와 완전히 동일한 것을
// 재사용한다(enrollments/actions.ts updateEnrollmentStatus, 내부적으로 lib/holdApply.ts).
export default async function StudentHoldsPage() {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.view");
  const scopeAgentId = actor.role === "AGENT" ? actor.agentId : undefined;

  const held = await prisma.enrollment.findMany({
    where: { siteId: DEFAULT_SITE_ID, status: "HOLDING", ...(scopeAgentId ? { agentId: scopeAgentId } : {}) },
    orderBy: { holdStartedAt: "desc" },
    include: { student: true },
  });

  const now = Date.now();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">학생홀드관리</h1>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">패키지</th>
              <th className="px-4 py-3">홀드 시작일</th>
              <th className="px-4 py-3">경과일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {held.map((e, i) => {
              const heldDays = e.holdStartedAt
                ? Math.max(1, Math.ceil((now - e.holdStartedAt.getTime()) / (24 * 60 * 60 * 1000)))
                : 0;
              return (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{held.length - i}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{e.student.name}</td>
                  <td className="px-4 py-3 text-slate-600">{e.packageMonths}개월</td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.holdStartedAt ? formatAppDate(e.holdStartedAt) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{heldDays}일째</td>
                  <td className="px-4 py-3 text-right">
                    <HoldReleaseButton action={updateEnrollmentStatus.bind(null, e.id, "ACTIVE")} />
                  </td>
                </tr>
              );
            })}
            {held.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  현재 홀드 중인 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
