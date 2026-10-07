import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";
import { checkPaidLeaveQuota, PAID_LEAVE_HALF_YEAR_MAX, PAID_LEAVE_YEAR_MAX, paidLeavePay, paidLeavePeriod } from "@/lib/paidLeavePolicy";
import { CreatePaidLeaveForm, PaidLeaveButtons } from "./PaidLeaveControls";

const STATUS_LABEL = { PENDING: "대기중", APPROVED: "승인됨", REJECTED: "거부됨" } as const;
const STATUS_STYLE = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-slate-200 text-slate-500",
} as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function TeacherPaidLeavesPage() {
  const actor = await requireBackofficeActor();
  if (actor.role === "AGENT") return <p className="text-sm text-slate-500">협력사 계정은 이 화면을 사용할 수 없습니다.</p>;

  const thisYear = Number(formatAppDate(new Date()).slice(0, 4));
  const [regularTeachers, leaves] = await Promise.all([
    prisma.teacher.findMany({
      where: { siteId: DEFAULT_SITE_ID, employmentType: "REGULAR", accountStatus: "ACTIVE" },
      orderBy: { realName: "asc" },
      select: { id: true, realName: true, nickname: true },
    }),
    prisma.teacherPaidLeave.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { leaveDate: "desc" },
      include: { teacher: { select: { realName: true, nickname: true, employmentType: true, rates: { orderBy: { effectiveFrom: "desc" }, take: 1, select: { ratePerUnit: true } } } }, _count: { select: { leaveRequests: true } } },
      take: 300,
    }),
  ]);

  // 강사별 올해 승인 현황(상반기/하반기/연간)
  const usage = new Map<number, { h1: number; h2: number; year: number }>();
  for (const l of leaves) {
    if (l.status !== "APPROVED") continue;
    const p = paidLeavePeriod(iso(l.leaveDate));
    if (p.year !== thisYear) continue;
    const u = usage.get(l.teacherId) ?? { h1: 0, h2: 0, year: 0 };
    if (p.half === 1) u.h1++;
    else u.h2++;
    u.year++;
    usage.set(l.teacherId, u);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">강사 유급휴가 관리</h1>
      <p className="mb-6 max-w-3xl text-sm text-slate-500">
        정규 강사(강사 편집 화면에서 지정)만 대상입니다. 상반기(1~6월) 최대 {PAID_LEAVE_HALF_YEAR_MAX}회 · 하반기(7~12월) 최대 {PAID_LEAVE_HALF_YEAR_MAX}회 · 연간
        최대 {PAID_LEAVE_YEAR_MAX}회(달력 기준). 휴가일 이전 승인이 원칙이며, 휴가일이 지난 뒤의 승인·수정은 관리자만 할 수 있고 사후 승인으로 기록됩니다.
        승인된 1건의 급여는 강사 레이트 × 8(그날 학생 수업이 몇 건이든 1회)이고, 승인하면 그 날 수업은 정규 수업 시퀀스에서 뒤로 밀립니다. 정전·인터넷 문제·지각 등
        일반 휴강(LEAVE)은 이 한도를 쓰지 않으며 급여도 지급되지 않습니다.
      </p>

      <CreatePaidLeaveForm teachers={regularTeachers.map((t) => ({ id: t.id, label: t.nickname ? `${t.realName} (${t.nickname})` : t.realName }))} />

      {regularTeachers.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">정규 강사</th>
                <th className="px-4 py-3">{thisYear} 상반기</th>
                <th className="px-4 py-3">{thisYear} 하반기</th>
                <th className="px-4 py-3">{thisYear} 연간</th>
              </tr>
            </thead>
            <tbody>
              {regularTeachers.map((t) => {
                const u = usage.get(t.id) ?? { h1: 0, h2: 0, year: 0 };
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.realName}</td>
                    <td className="px-4 py-3 text-slate-600">{u.h1} / {PAID_LEAVE_HALF_YEAR_MAX}</td>
                    <td className="px-4 py-3 text-slate-600">{u.h2} / {PAID_LEAVE_HALF_YEAR_MAX}</td>
                    <td className="px-4 py-3 text-slate-600">{u.year} / {PAID_LEAVE_YEAR_MAX}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {regularTeachers.length === 0 && (
        <p className="mb-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">정규 강사로 지정된 강사가 없습니다. 강사 편집 화면의 &quot;정규 강사 여부&quot;에서 지정해 주세요.</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">휴가일</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">사유</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">승인</th>
              <th className="px-4 py-3">급여(레이트×8)</th>
              <th className="px-4 py-3">재배치된 수업</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => {
              const rate = l.teacher.rates[0] ? Number(l.teacher.rates[0].ratePerUnit) : 0;
              const approvedOther = leaves.filter((o) => o.teacherId === l.teacherId && o.status === "APPROVED" && o.id !== l.id).map((o) => iso(o.leaveDate));
              const quota = l.status === "APPROVED" ? null : checkPaidLeaveQuota(iso(l.leaveDate), approvedOther);
              return (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-900">{iso(l.leaveDate)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {l.teacher.realName}
                    {l.teacher.employmentType !== "REGULAR" && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] font-bold text-red-600">비정규</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{l.reason ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                    {l.postApproval && <span className="ml-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-700">사후 승인</span>}
                    {quota && !quota.ok && <p className="mt-1 text-[11px] text-red-600">한도 초과 — 승인할 수 없음</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{l.approvedAt ? formatAppDateTime(l.approvedAt) : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{l.status === "APPROVED" ? paidLeavePay(rate).toLocaleString() : "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{l.status === "APPROVED" ? `${l._count.leaveRequests}건` : "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <PaidLeaveButtons id={l.id} status={l.status} />
                  </td>
                </tr>
              );
            })}
            {leaves.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  등록된 유급휴가가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
