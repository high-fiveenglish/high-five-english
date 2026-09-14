import { Printer } from "lucide-react";
import { Modal } from "../ui/Modal";
import { findStudentEnglishName, findStudentName, type EnrollmentHistoryRow } from "../../services/classroomService";

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-brand-950">{value}</dd>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <p className="text-sm font-extrabold text-brand-950">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

export function AttendanceCertificateModal({
  row,
  onClose,
}: {
  row: EnrollmentHistoryRow | null;
  onClose: () => void;
}) {
  if (!row) return null;
  const { enrollment, teacher, stats } = row;
  const studentName = `${findStudentName(enrollment.studentId)} (${findStudentEnglishName(enrollment.studentId)})`;

  return (
    <Modal open={!!row} onClose={onClose} title="출석증" maxWidth="max-w-lg">
      <div className="print-area">
        <h3 className="mb-1 hidden text-base font-extrabold text-brand-950 print:block">출석증</h3>

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-accent-600">수강정보</p>
          <dl>
            <Row label="수강자" value={studentName} />
            <Row label="강의제목" value={row.displayName} />
            <Row label="수강기간" value={`${enrollment.startDate}~${enrollment.endDate}`} />
            <Row label="수업시간" value={`${enrollment.classTime}~${row.classEndTime}`} />
            <Row label="담당강사" value={`${teacher.name} (${teacher.nameEn})`} />
          </dl>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-accent-600">학습진도</p>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="총강의수" value={`${stats.totalLessons}회`} />
            <StatTile label="수강수" value={`${stats.takenLessons}회`} />
            <StatTile label="잔여강의수" value={`${stats.remainingLessons}회`} />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-accent-600">수강상태</p>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="출석율" value={`${stats.attendanceRatePercent}%`} />
            <StatTile label="출석" value={`${stats.attended}/${stats.takenLessons}`} />
            <StatTile label="결석" value={stats.absent} />
            <StatTile label="수업취소" value={stats.adminCancelled} />
            <StatTile label="휴강" value={stats.teacherAbsent} />
            <StatTile label="연기" value={stats.rescheduled} />
          </div>
        </div>

        <p className="mt-6 hidden text-center text-[11px] text-slate-400 print:block">
          ※ 본 출석증은 회사 또는 학교 제출용으로 사용 가능합니다 ※
        </p>
      </div>

      <button
        onClick={() => window.print()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 print:hidden"
      >
        <Printer size={15} /> 인쇄하기
      </button>
    </Modal>
  );
}
