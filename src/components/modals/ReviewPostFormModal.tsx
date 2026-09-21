import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { createBoardPost, updateBoardPost } from "../../services/reviewService";
import type { ReviewPost } from "../../lib/community/types";

/** Write/edit form for the review board — used for a brand-new top-level post, a reply
 * (parentId set), or editing an existing post the actor authored (editingPost set). */
export function ReviewPostFormModal({
  open,
  parentId,
  editingPost,
  onClose,
  onSaved,
}: {
  open: boolean;
  parentId?: string;
  editingPost?: ReviewPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { studentApiToken, adminApiToken } = useAuth();
  // 관리자(general_manager/general_admin)는 studentApiToken이 없으므로 adminApiToken으로
  // 대신 쓴다 — "관리자도 댓글/작성 가능"해야 하기 때문이다.
  const token = studentApiToken ?? adminApiToken;
  const { t } = useTranslation("reviewBoard");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 댓글(대댓글)은 제목이 없다 — 새로 달 때는 parentId로, 기존 댓글을 고칠 때는
  // editingPost.parentId로 판단한다.
  const isReply = Boolean(parentId ?? editingPost?.parentId);

  useEffect(() => {
    if (!open) return;
    setTitle(editingPost?.title ?? "");
    setContent(editingPost?.content ?? "");
    setError(null);
  }, [open, editingPost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || (!isReply && !title.trim())) {
      setError(t("form.validation_error"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = editingPost
      ? await updateBoardPost(token, editingPost.id, { title, content, isReply })
      : await createBoardPost(token, { title, content, parentId });
    setSubmitting(false);
    if (!result.ok) {
      setError(t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      return;
    }
    onSaved();
    onClose();
  };

  const title_ = editingPost ? t("form.edit_title") : parentId ? t("form.reply_title") : t("form.new_title");

  return (
    <Modal open={open} onClose={onClose} title={title_}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {!isReply && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("form.field_title")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">{t("form.field_content")}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder={t("form.content_placeholder")}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? t("form.submitting") : t("form.submit")}
        </button>
      </form>
    </Modal>
  );
}
