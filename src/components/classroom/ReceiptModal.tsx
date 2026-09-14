import { Printer } from "lucide-react";
import { Modal } from "../ui/Modal";
import { CONTACT } from "../../data/contact";
import { formatPrice } from "../../data/currencies";
import { findStudentEnglishName, findStudentName, type EnrollmentHistoryRow } from "../../services/classroomService";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-brand-950">{value}</dd>
    </div>
  );
}

export function ReceiptModal({ row, onClose }: { row: EnrollmentHistoryRow | null; onClose: () => void }) {
  if (!row) return null;
  const { enrollment, teacher, stats } = row;
  const studentName = `${findStudentName(enrollment.studentId)} (${findStudentEnglishName(enrollment.studentId)})`;

  return (
    <Modal open={!!row} onClose={onClose} title="결제 영수증" maxWidth="max-w-lg">
      <div className="print-area">
        <h3 className="mb-1 text-base font-extrabold text-brand-950 print:block hidden">결제 영수증</h3>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-accent-600">구매자</p>
          <dl>
            <Row label="회원이름" value={studentName} />
            <Row label="수강과목" value={row.course.courseName} />
            <Row label="수강시간" value={`주${enrollment.weeklyDays.length}회 수업`} />
            <Row label="수강기간" value={`${row.durationMonths}개월`} />
            <Row label="수업시작일/종료일" value={`${enrollment.startDate}~${enrollment.endDate}`} />
            <Row label="강사이름" value={`${teacher.name} (${teacher.nameEn})`} />
            <Row label="출석률" value={`${stats.attendanceRatePercent}%`} />
            <Row
              label="결제금액"
              value={row.estimatedPriceKRW !== undefined ? formatPrice(row.estimatedPriceKRW, "KRW") : "-"}
            />
            <Row label="결제방법" value={`${CONTACT.bank.bankName} ${CONTACT.bank.accountNumber} ${CONTACT.company.name}`} />
            <Row label="결제상태" value="결제완료" />
          </dl>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-accent-600">공급자</p>
          <dl>
            <Row label="사업자등록번호" value={CONTACT.company.bizRegNo} />
            <Row label="상호" value={CONTACT.company.name} />
            <Row label="대표자" value={CONTACT.company.ceo} />
            <Row label="사업자소재지" value={CONTACT.company.address} />
          </dl>
        </div>

        <p className="mt-6 text-center text-sm font-bold text-brand-950 print:block hidden">대표 {CONTACT.company.ceo}</p>
        <p className="mt-1 text-center text-[11px] text-slate-400 print:block hidden">
          ※ 본 영수증은 회사 제출용으로도 사용 가능합니다 ※
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
