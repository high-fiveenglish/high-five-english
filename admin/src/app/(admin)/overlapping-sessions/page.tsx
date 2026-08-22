import { DEFAULT_SITE_ID } from "@/lib/constants";
import { findAllOverlappingSessions } from "@/lib/scheduleConflict";

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function OverlappingSessionsPage() {
  const pairs = await findAllOverlappingSessions(DEFAULT_SITE_ID);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">겹치는 수업 내역</h1>
      <p className="mb-6 text-sm text-slate-500">
        같은 강사에게 시간이 겹치게 배정된 수업을 진단합니다. 수업 등록·강사 배정 시 겹침을 미리 막고
        있으므로 정상적으로는 비어 있어야 합니다 — 상태를 수동으로 되돌리는 등의 예외 상황을 잡아내는
        점검용 화면입니다.
      </p>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">수업 A</th>
              <th className="px-4 py-3">수업 B</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{p.teacherName}</td>
                <td className="px-4 py-3 text-slate-600">
                  {fmtDateTime(p.a.scheduledAt)} ({p.a.durationMin}분) · {p.a.studentName} 학생
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {fmtDateTime(p.b.scheduledAt)} ({p.b.durationMin}분) · {p.b.studentName} 학생
                </td>
              </tr>
            ))}
            {pairs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                  겹치는 수업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
