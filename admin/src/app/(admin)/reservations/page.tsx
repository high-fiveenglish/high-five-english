import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { WEEKDAYS } from "@/lib/weekdays";
import { CLASS_METHOD_OPTIONS } from "@/lib/levelTestOptions";
import { formatAppDate } from "@/lib/appTime";
import { DeleteButton } from "../DeleteButton";
import { cancelReservation } from "./actions";

const WEEKDAY_LABEL: Record<number, string> = Object.fromEntries(WEEKDAYS.map((d) => [d.value, d.label]));
const CLASS_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  CLASS_METHOD_OPTIONS.map((o) => [o.value, o.label]),
);
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const STATUS_LABEL: Record<string, string> = { RESERVED: "예약중", CONVERTED: "등록완료", CANCELLED: "취소됨" };
const STATUS_CLASS: Record<string, string> = {
  RESERVED: "bg-amber-100 text-amber-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

type ReservationRow = Awaited<ReturnType<typeof loadReservations>>[number];

async function loadReservations(showAll: boolean) {
  return prisma.slotReservation.findMany({
    where: { siteId: DEFAULT_SITE_ID, ...(showAll ? {} : { status: "RESERVED" }) },
    orderBy: { createdAt: "desc" },
    include: { teacher: { select: { realName: true } }, agent: { select: { name: true } } },
  });
}

// DB는 여전히 요일당 1행씩 유지하지만(구글시트 동기화 로직이 행 단위로 동작하므로),
// 화면에서는 groupId가 같은 행을 하나의 "예약 건"으로 묶어서 보여준다 — legacy 행
// (groupId=null)은 자기 id를 유일한 그룹 키로 삼아 그 행 혼자만의 그룹이 된다.
function groupReservations(rows: ReservationRow[]) {
  const groups = new Map<string, ReservationRow[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = r.groupId ?? `legacy:${r.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  return order.map((key) => ({
    key,
    // 취소/등록전환 액션에 넘길 실제 키 — legacy는 순수 숫자 id 문자열, 신규 그룹은
    // groupId(UUID) 문자열. actions.ts의 cancelReservation이 이 값의 형태(숫자인지
    // 아닌지)만으로 legacy/그룹을 구분한다.
    actionKey: groups.get(key)![0].groupId ?? String(groups.get(key)![0].id),
    rows: groups.get(key)!.sort((a, b) => WEEKDAY_DISPLAY_ORDER.indexOf(a.weekday) - WEEKDAY_DISPLAY_ORDER.indexOf(b.weekday)),
  }));
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showAll = filter === "all";

  const reservations = await loadReservations(showAll);
  const groups = groupReservations(reservations);

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
              <th className="px-4 py-3">빈도 · 요일/시간</th>
              <th className="px-4 py-3">수업 방법</th>
              <th className="px-4 py-3">상담자</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">메모</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">등록일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const first = g.rows[0];
              const allSameStatus = g.rows.every((r) => r.status === first.status);
              return (
                <tr key={g.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-600">{first.agent?.name ?? "본사"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{first.teacher.realName}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="mb-0.5 block text-xs font-bold text-slate-400">
                      주 {g.rows.length}회 ({first.durationMin}분)
                    </span>
                    <span className="whitespace-nowrap">
                      {g.rows.map((r) => `${WEEKDAY_LABEL[r.weekday]} ${r.classTime}`).join(" / ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {first.classMethod ? (CLASS_METHOD_LABEL[first.classMethod] ?? first.classMethod) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{first.prospectName}</td>
                  <td className="px-4 py-3 text-slate-500">{first.contactPhone ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{first.note ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASS[allSameStatus ? first.status : "RESERVED"]}`}
                    >
                      {allSameStatus ? STATUS_LABEL[first.status] : "일부 변경됨"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatAppDate(first.createdAt)}</td>
                  <td className="px-4 py-3">
                    {first.status === "RESERVED" && (
                      <div className="flex flex-wrap gap-1.5">
                        <Link
                          href={`/enrollments/new?fromReservation=${g.actionKey}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          등록전환
                        </Link>
                        <DeleteButton action={cancelReservation.bind(null, g.actionKey)} label="취소" />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
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
