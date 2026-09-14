import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { AdminHomeNoticeFormModal } from "../components/modals/AdminHomeNoticeFormModal";
import { useAuth } from "../context/AuthContext";
import { listAllHomeNotices, deleteHomeNotice } from "../services/homeNoticeService";
import type { HomeNotice } from "../lib/community/types";

function formatDateTime(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

function AdminHomeNoticesContent() {
  const { adminApiToken } = useAuth();
  const { t } = useTranslation("admin");
  const [notices, setNotices] = useState<HomeNotice[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HomeNotice | null>(null);

  const load = () => {
    listAllHomeNotices(adminApiToken).then((res) => {
      if (res.ok) setNotices(res.value);
    });
  };

  useEffect(load, [adminApiToken]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (n: HomeNotice) => {
    setEditing(n);
    setFormOpen(true);
  };
  const handleDelete = async (id: string) => {
    await deleteHomeNotice(adminApiToken, id);
    load();
  };

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <SectionHeading eyebrow={t("eyebrow")} title={t("homeNotices.admin_title")} align="left" />
            <p className="mt-1 text-sm text-slate-500">{t("homeNotices.admin_description")}</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            <Plus size={16} /> {t("notices.new_button")}
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                {Object.values(
                  t("notices.table_headers", { returnObjects: true }) as Record<string, string>,
                ).map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                    {t("notices.no_rows")}
                  </td>
                </tr>
              )}
              {notices.map((n) => (
                <tr key={n.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
                  <td className="px-4 py-3 text-sm font-bold text-brand-950">{n.title}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{n.authorName}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[12px] text-slate-500">
                    {formatDateTime(n.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        n.published ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {n.published ? t("notices.status_published") : t("notices.status_hidden")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(n)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
                        aria-label={t("notices.edit_title")}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label={t("notices.delete_button")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      <AdminHomeNoticeFormModal
        open={formOpen}
        notice={editing}
        onClose={() => setFormOpen(false)}
        onSaved={load}
      />
    </section>
  );
}

export function AdminHomeNoticesPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="homeNotices"
      onOpenLogin={onOpenLogin}
    >
      <AdminHomeNoticesContent />
    </RouteGuard>
  );
}
