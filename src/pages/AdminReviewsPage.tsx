import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import { listBoardPosts, deleteBoardPost } from "../services/reviewService";
import type { ReviewPost } from "../lib/community/types";

function formatDateTime(iso: string) {
  return iso.slice(0, 16).replace("T", " ");
}

function AdminReviewsContent() {
  const { adminApiToken } = useAuth();
  const { t } = useTranslation("admin");
  const [reviews, setReviews] = useState<ReviewPost[]>([]);

  const load = () => {
    listBoardPosts(adminApiToken).then((res) => {
      if (res.ok) setReviews(res.value);
    });
  };

  useEffect(load, [adminApiToken]);

  const handleDelete = async (id: string) => {
    await deleteBoardPost(adminApiToken, id);
    load();
  };

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("reviews.admin_title")} align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {t("reviews.admin_description")}
        </p>

        <div className="mt-6 space-y-3">
          {reviews.length === 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white py-12 text-center text-sm text-slate-400">
              {t("reviews.no_rows")}
            </div>
          )}
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(20,44,88,0.06)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-brand-950">
                    {r.title}
                    <span className="ml-2 font-normal text-slate-400">{r.authorName}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{formatDateTime(r.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={t("notices.delete_button")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">{r.content}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

export function AdminReviewsPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="reviews"
      onOpenLogin={onOpenLogin}
    >
      <AdminReviewsContent />
    </RouteGuard>
  );
}
