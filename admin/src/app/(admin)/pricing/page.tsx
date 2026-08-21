import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { PriceCell } from "./PriceCell";

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

export default async function PricingPage() {
  const durations = await prisma.pricingDuration.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { order: "asc" },
    include: { rows: true },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">화상영어 가격표 관리</h1>
      <p className="mb-6 text-sm text-slate-500">
        셀을 클릭해 수정하고 포커스를 벗어나면(blur) 자동 저장됩니다. 통화별 가격은 서로 독립적입니다.
      </p>

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
            <table className="w-full text-sm">
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
