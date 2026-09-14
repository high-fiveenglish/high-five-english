import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { createHomeNotice, updateHomeNotice } from "../../services/homeNoticeService";
import type { HomeNotice } from "../../lib/community/types";

export function AdminHomeNoticeFormModal({
  open,
  notice,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = creating a new notice; otherwise editing this one. */
  notice: HomeNotice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { adminApiToken } = useAuth();
  const { t } = useTranslation("admin");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(notice?.title ?? "");
    setContent(notice?.content ?? "");
    setPublished(notice?.published ?? true);
    setError(null);
  }, [open, notice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError(t("notices.validation_error"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = notice
      ? await updateHomeNotice(adminApiToken, notice.id, { title, content, published })
      : await createHomeNotice(adminApiToken, { title, content, published });
    setSubmitting(false);
    if (!result.ok) {
      setError(t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={notice ? t("notices.edit_title") : t("notices.create_title")}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("notices.field_title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("notices.field_content")}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          {t("notices.field_published")}
        </label>

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? t("notices.saving") : t("notices.save")}
        </button>
      </form>
    </Modal>
  );
}
