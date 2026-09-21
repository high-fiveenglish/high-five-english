import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission } from "@/lib/rbac";
import { formatAppDate } from "@/lib/appTime";

function formatPrice(amount: number): string {
  return `${amount.toLocaleString()}원`;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: "미결제", PAID: "결제완료", FAILED: "결제실패" };
const PAYMENT_STATUS_CLASS: Record<string, string> = {
  UNPAID: "bg-slate-100 text-slate-500",
  PAID: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

// 협력사 관리자(AGENT)가 자기 협력사 수강생들의 결제/정산 현황을 한눈에 보는 화면 —
// 별도의 정산 모델을 새로 만들지 않고, 이미 있는 Enrollment.actualPriceKRW/
// paymentStatus를 그대로 집계해서 보여준다.
export default async function SettlementsPage() {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "enrollments.view");
  const scopeAgentId = actor.role === "AGENT" ? actor.agentId : undefined;

  const enrollments = await prisma.enrollment.findMany({
    where: { siteId: DEFAULT_SITE_ID, ...(scopeAgentId ? { agentId: scopeAgentId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { student: true },
  });

  const totalPaid = enrollments
    .filter((e) => e.paymentStatus === "PAID")
    .reduce((sum, e) => sum + (e.actualPriceKRW ?? 0), 0);
  const totalUnpaid = enrollments
    .filter((e) => e.paymentStatus !== "PAID")
    .reduce((sum, e) => sum + (e.actualPriceKRW ?? 0), 0);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">정산내역</h1>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-400">전체 건수</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{enrollments.length.toLocaleString()}건</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-400">결제완료 합계</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{formatPrice(totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-400">미결제 합계</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{formatPrice(totalUnpaid)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">패키지</th>
              <th className="px-4 py-3">수강기간</th>
              <th className="px-4 py-3">결제금액</th>
              <th className="px-4 py-3">결제상태</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e, i) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-500">{enrollments.length - i}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{e.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{e.packageMonths}개월</td>
                <td className="px-4 py-3 text-slate-500">
                  {formatAppDate(e.startDate)} ~ {formatAppDate(e.endDate)}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {e.actualPriceKRW !== null ? formatPrice(e.actualPriceKRW) : "-"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      PAYMENT_STATUS_CLASS[e.paymentStatus ?? "UNPAID"]
                    }`}
                  >
                    {PAYMENT_STATUS_LABEL[e.paymentStatus ?? "UNPAID"]}
                  </span>
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  정산할 수강 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
