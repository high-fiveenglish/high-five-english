import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { AdminInstructorFormModal } from "../components/modals/AdminInstructorFormModal";
import { useAuth } from "../context/AuthContext";
import {
  listAllInstructors,
  deleteInstructor,
  reorderInstructors,
} from "../services/instructorService";
import type { Instructor } from "../data/instructors";

function AdminInstructorsContent() {
  const { actor } = useAuth();
  const { t } = useTranslation("admin");
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Instructor | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = () => {
    if (!actor) return;
    listAllInstructors(actor).then((res) => {
      if (res.ok) setInstructors(res.value);
    });
  };

  useEffect(load, [actor]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (i: Instructor) => {
    setEditing(i);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!actor) return;
    setDeleteError(null);
    const result = await deleteInstructor(actor, id);
    if (!result.ok) {
      // FORBIDDEN_OWNERSHIP here specifically means "referenced by a teacher account or
      // an enrollment" (see instructorService.deleteInstructor) — a more specific
      // situation than that error code's generic common:service_errors mapping
      // ("본인의 데이터만 처리할 수 있습니다"), so show the dedicated message instead.
      setDeleteError(
        result.error.code === "FORBIDDEN_OWNERSHIP"
          ? t("instructors.delete_blocked")
          : t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }),
      );
      return;
    }
    load();
  };

  const moveInstructor = async (index: number, direction: -1 | 1) => {
    if (!actor) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= instructors.length) return;
    const reordered = [...instructors];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const result = await reorderInstructors(actor, reordered.map((i) => i.id));
    if (result.ok) setInstructors(result.value);
  };

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading eyebrow={t("eyebrow")} title={t("instructors.admin_title")} align="left" />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> {t("instructors.new_button")}
          </button>
        </div>

        {deleteError && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{deleteError}</p>
        )}

        <div className="mt-6 space-y-3">
          {instructors.length === 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white py-12 text-center text-sm text-slate-400">
              {t("instructors.no_rows")}
            </div>
          )}
          {instructors.map((ins, index) => (
            <div
              key={ins.id}
              className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(20,44,88,0.06)]"
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveInstructor(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                  aria-label="up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => moveInstructor(index, 1)}
                  disabled={index === instructors.length - 1}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                  aria-label="down"
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              {ins.photoUrl ? (
                <img src={ins.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-extrabold text-white ${ins.gradient}`}
                >
                  {ins.name[0]}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-brand-950">
                  {ins.flag} {ins.name} <span className="font-normal text-slate-400">{ins.nameEn}</span>
                </p>
                <p className="truncate text-xs text-slate-400">{ins.classFeatures.join(" · ")}</p>
              </div>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  ins.published ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {ins.published ? t("instructors.status_published") : t("instructors.status_hidden")}
              </span>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => openEdit(ins)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
                  aria-label={t("instructors.edit_title")}
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => handleDelete(ins.id)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={t("instructors.delete_button")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Container>

      <AdminInstructorFormModal
        open={formOpen}
        instructor={editing}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </section>
  );
}

export function AdminInstructorsPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="teachers"
      onOpenLogin={onOpenLogin}
    >
      <AdminInstructorsContent />
    </RouteGuard>
  );
}
