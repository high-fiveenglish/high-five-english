import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RescheduleRequestsTable } from "../components/classroom/admin/RescheduleRequestsTable";
import { AdminOverrideLessonModal } from "../components/modals/AdminOverrideLessonModal";
import { listRescheduleRequests, type AdminRescheduleRow } from "../services/classroomService";

export function AdminReschedulePage() {
  const [rows, setRows] = useState<AdminRescheduleRow[]>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const load = () => {
    listRescheduleRequests().then(setRows);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading eyebrow="관리자" title="수업 연기 신청 내역" align="left" />
          <button
            onClick={() => setOverrideOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            <Settings2 size={16} /> 수업 일정 수동 변경
          </button>
        </div>

        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          학생이 연기한 수업, 강사 결석·휴강·관리자 취소로 자동 연장된 수업이 모두 여기에 기록됩니다.
          "종료일 변경 전 → 후"에서 이 연기가 수강 종료일에 미친 영향을 확인할 수 있습니다.
        </p>

        <div className="mt-6">
          <RescheduleRequestsTable rows={rows} />
        </div>
      </Container>

      <AdminOverrideLessonModal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        onSaved={load}
      />
    </section>
  );
}
