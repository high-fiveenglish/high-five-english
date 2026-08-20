import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { RescheduleRequestsTable } from "../components/classroom/admin/RescheduleRequestsTable";
import { AdminOverrideLessonModal } from "../components/modals/AdminOverrideLessonModal";
import { useAuth } from "../context/AuthContext";
import { listRescheduleRequests, type AdminRescheduleRow } from "../services/adminService";

function AdminRescheduleContent() {
  const { actor } = useAuth();
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState<AdminRescheduleRow[]>([]);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const load = () => {
    if (!actor) return;
    listRescheduleRequests(actor).then((res) => {
      if (res.ok) setRows(res.value);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading eyebrow={t("eyebrow")} title={t("reschedule.title")} align="left" />
          <button
            onClick={() => setOverrideOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            <Settings2 size={16} /> {t("reschedule.manual_change_btn")}
          </button>
        </div>

        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {t("reschedule.description")}
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

export function AdminReschedulePage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="schedule"
      onOpenLogin={onOpenLogin}
    >
      <AdminRescheduleContent />
    </RouteGuard>
  );
}
