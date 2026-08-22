import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteEnrollment } from "./actions";
import { StatusSelect } from "./StatusSelect";
import { PaymentStatusSelect } from "./PaymentStatusSelect";
import { FILTER_TABS, buildEnrollmentWhere } from "./filters";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  const enrollments = await prisma.enrollment.findMany({
    where: { siteId: DEFAULT_SITE_ID, ...buildEnrollmentWhere(filter) },
    orderBy: { id: "desc" },
    include: { student: true, teacher: true },
    take: 300,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">수강내역관리</h1>
        <Link
          href="/enrollments/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 수강신청 등록
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTER_TABS.map((tab) => {
          const active = (filter ?? "all") === tab.key;
          const href = tab.key === "all" ? "/enrollments" : `/enrollments?filter=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">패키지</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">요일</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">총 회차</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">결제</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{e.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{e.teacher?.realName ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">{e.packageMonths}개월</td>
                <td className="px-4 py-3 text-slate-600">{e.classMethod}</td>
                <td className="px-4 py-3 text-slate-600">{e.scheduleDays}</td>
                <td className="px-4 py-3 text-slate-500">
                  {fmtDate(e.startDate)} ~ {fmtDate(e.endDate)}
                </td>
                <td className="px-4 py-3 text-slate-600">{e.totalSessions}회</td>
                <td className="px-4 py-3">
                  <StatusSelect id={e.id} status={e.status} />
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusSelect id={e.id} paymentStatus={e.paymentStatus} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteEnrollment.bind(null, e.id)} />
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                  해당하는 수강내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
