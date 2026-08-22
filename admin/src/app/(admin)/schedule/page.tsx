import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteClassSession } from "./actions";
import { SessionStatusSelect } from "./SessionStatusSelect";

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 7);
  const defaultTo = new Date(today);
  defaultTo.setDate(defaultTo.getDate() + 14);

  const rangeFrom = from ? new Date(from) : defaultFrom;
  const rangeTo = to ? new Date(to) : defaultTo;

  const sessions = await prisma.classSession.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      scheduledAt: { gte: rangeFrom, lte: rangeTo },
      deletedAt: null,
    },
    orderBy: { scheduledAt: "asc" },
    include: { student: true, teacher: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">전체 일정표</h1>
        <Link
          href="/schedule/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 수업 등록
        </Link>
      </div>

      <form className="mb-4 flex items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          시작일
          <input
            type="date"
            name="from"
            defaultValue={rangeFrom.toISOString().slice(0, 10)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          종료일
          <input type="date" name="to" defaultValue={rangeTo.toISOString().slice(0, 10)} className="input" />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          조회
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">수업 일시</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">시간(분)</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-900">{fmtDateTime(s.scheduledAt)}</td>
                <td className="px-4 py-3 text-slate-600">{s.student.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.teacher.realName}</td>
                <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                <td className="px-4 py-3">
                  <SessionStatusSelect id={s.id} status={s.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteClassSession.bind(null, s.id)} />
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  해당 기간에 등록된 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
