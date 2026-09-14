import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";
import { StatusSelect } from "./StatusSelect";

const TRACK_LABEL: Record<string, string> = { junior: "주니어", senior: "성인", business: "비즈니스" };
const DURATION_LABEL: Record<string, string> = { "1m": "1개월", "3m": "3개월", "6m": "6개월" };
const FREQUENCY_LABEL: Record<string, string> = { freq5: "주 5회", freq3: "주 3회", freq2: "주 2회" };
const PLATFORM_LABEL: Record<string, string> = { zoom: "Zoom", voov: "VooV", teams: "Teams" };

export default async function EnrollmentRequestsPage() {
  const requests = await prisma.enrollmentRequest.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { id: "desc" },
    include: { student: true },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">수강신청 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          마케팅 사이트에서 로그인한 학생이 제출한 수강신청 리드입니다. 실제 수강등록은 검토 후 수강내역관리에서 별도로 생성합니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">신청일시</th>
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3">과정</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">빈도/시간</th>
              <th className="px-4 py-3">희망 시작일</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">적립금 사용</th>
              <th className="px-4 py-3">상태</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatAppDateTime(r.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="font-medium text-slate-900">{r.student.name}</p>
                  <p className="text-xs text-slate-400">{r.student.loginId}</p>
                </td>
                <td className="px-4 py-3">{TRACK_LABEL[r.curriculumTrack] ?? r.curriculumTrack}</td>
                <td className="px-4 py-3">{DURATION_LABEL[r.durationId] ?? r.durationId}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {FREQUENCY_LABEL[r.lessonFrequency] ?? r.lessonFrequency} · {r.lessonDurationMin}분
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatAppDate(r.preferredStartDate)} {r.preferredStartTimeKST}
                </td>
                <td className="px-4 py-3">
                  {PLATFORM_LABEL[r.meetingPlatform] ?? r.meetingPlatform}
                  {r.teamsId && <span className="ml-1 text-xs text-slate-400">({r.teamsId})</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.pointsToUse.toLocaleString()}P</td>
                <td className="px-4 py-3">
                  <StatusSelect id={r.id} status={r.status} />
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  접수된 수강신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
