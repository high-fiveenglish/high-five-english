import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID, HIGHFIVE_AGENT_CODE } from "@/lib/constants";
import { PriceCell } from "./PriceCell";
import { ensureAgentPricing } from "./actions";

const FREQUENCY_LABEL: Record<string, string> = {
  freq5: "주 5회",
  freq3: "주 3회",
  freq2: "주 2회",
};

const DURATION_LABEL: Record<string, string> = {
  "1m": "1개월",
  "3m": "3개월",
  "6m": "6개월",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const { agentId: agentIdRaw } = await searchParams;

  const agents = await prisma.agent.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { name: "asc" },
  });
  const isHighfiveTab = !agentIdRaw;
  const selectedAgentId = agentIdRaw ? Number(agentIdRaw) : null;

  // 협력사 탭이면(직영 제외) 가격표가 아직 없을 때 본사 기준으로 한 번 초기화해둔다.
  if (selectedAgentId) {
    await ensureAgentPricing(selectedAgentId);
  }

  const durations = await prisma.pricingDuration.findMany({
    where: { siteId: DEFAULT_SITE_ID, agentId: selectedAgentId },
    orderBy: { order: "asc" },
    include: { rows: true },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">화상영어 가격표 관리</h1>
      <p className="mb-6 text-sm text-slate-500">
        셀을 클릭해 수정하고 포커스를 벗어나면(blur) 자동 저장됩니다. 통화별 가격은 서로 독립적입니다. 협력사
        탭은 본사 가격표를 기준으로 시작되며, 이후 협력사별로 자유롭게 다르게 설정할 수 있습니다.
      </p>

      <div className="mb-6 flex gap-2 text-sm">
        <Link
          href="/pricing"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            isHighfiveTab ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          직영
        </Link>
        {agents
          .filter((a) => a.code !== HIGHFIVE_AGENT_CODE)
          .map((a) => (
            <Link
              key={a.id}
              href={`/pricing?agentId=${a.id}`}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                selectedAgentId === a.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {a.name}
            </Link>
          ))}
      </div>

      <div className="flex flex-col gap-8">
        {durations.map((d) => (
          <div key={d.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">
                {DURATION_LABEL[d.code] ?? d.code}
              </h2>
              {d.hasBadge && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
                  뱃지 표시
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-2">빈도</th>
                    <th className="px-4 py-2" colSpan={3}>
                      25분 수업 (KRW / CNY / VND)
                    </th>
                    <th className="px-4 py-2" colSpan={3}>
                      50분 수업 (KRW / CNY / VND)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-700">
                        {FREQUENCY_LABEL[r.frequencyId] ?? r.frequencyId}
                      </td>
                      <td className="px-2 py-2.5">
                        <PriceCell rowId={r.id} field="price25KRW" value={r.price25KRW} />
                      </td>
                      <td className="px-2 py-2.5">
                        <PriceCell rowId={r.id} field="price25CNY" value={r.price25CNY} />
                      </td>
                      <td className="px-2 py-2.5">
                        <PriceCell rowId={r.id} field="price25VND" value={r.price25VND} />
                      </td>
                      <td className="px-2 py-2.5">
                        <PriceCell rowId={r.id} field="price50KRW" value={r.price50KRW} />
                      </td>
                      <td className="px-2 py-2.5">
                        <PriceCell rowId={r.id} field="price50CNY" value={r.price50CNY} />
                      </td>
                      <td className="px-2 py-2.5">
                        <PriceCell rowId={r.id} field="price50VND" value={r.price50VND} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {durations.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400">
            등록된 가격표가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
