import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { WEEKDAYS } from "@/lib/weekdays";
import { formatAppDate } from "@/lib/appTime";
import { DeleteButton } from "../DeleteButton";
import { cancelReservation } from "./actions";

const WEEKDAY_LABEL: Record<number, string> = Object.fromEntries(WEEKDAYS.map((d) => [d.value, d.label]));

const STATUS_LABEL: Record<string, string> = { RESERVED: "예약중", CONVERTED: "등록완료", CANCELLED: "취소됨" };
const STATUS_CLASS: Record<string, string> = {
  RESERVED: "bg-amber-100 text-amber-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showAll = filter === "all";

  const reservations = await prisma.slotReservation.findMany({
    where: { siteId: DEFAULT_SITE_ID, ...(showAll ? {} : { status: "RESERVED" }) },
    orderBy: { createdAt: "desc" },
    include: { teacher: { select: { realName: true } }, agent: { select: { name: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">강사 자리 예약</h1>
        <Link
          href="/reservations/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 예약 등록
        </Link>
      </div>
      <p className="mb-4 -mt-2 text-sm text-slate-500">
        상담 단계에서 강사 자리를 미리 표시해둡니다 — 구글시트(강사 스케줄)에도 바로 반영됩니다. 실제 등록으로
        이어지면 "등록전환"으로 수강신청 화면에 이어서 진행하고, 상담이 무산되면 "취소"로 자리를 비웁니다.
      </p>

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/reservations"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            !showAll ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          예약중
        </Link>
        <Link
          href="/reservations?filter=all"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            showAll ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          전체 이력
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">협력사</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">요일/시간</th>
              <th className="px-4 py-3">상담자</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">메모</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">등록일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-600">{r.agent?.name ?? "본사"}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{r.teacher.realName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  {WEEKDAY_LABEL[r.weekday]} {r.classTime} ({r.durationMin}분)
                </td>
                <td className="px-4 py-3 text-slate-600">{r.prospectName}</td>
                <td className="px-4 py-3 text-slate-500">{r.contactPhone ?? "-"}</td>
                <td className="px-4 py-3 text-slate-500">{r.note ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatAppDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  {r.status === "RESERVED" && (
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/enrollments/new?fromReservation=${r.id}`}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        등록전환
                      </Link>
                      <DeleteButton action={cancelReservation.bind(null, r.id)} label="취소" />
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {reservations.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  예약 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
