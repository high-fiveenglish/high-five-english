import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CornerDownRight, LogIn, Pencil, Plus, Trash2 } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { ReviewPostFormModal } from "../components/modals/ReviewPostFormModal";
import { useAuth } from "../context/AuthContext";
import { listBoardPosts, getBoardPost, deleteBoardPost } from "../services/reviewService";
import type { ReviewPost } from "../lib/community/types";

function formatDate(iso: string) {
  return iso.slice(2, 10);
}

function ReviewBoardContent() {
  const { userName, studentApiToken, adminApiToken, isRealAccount, studentProfile } = useAuth();
  // 관리자(general_manager/general_admin)는 studentApiToken이 없으므로, 조회는
  // adminApiToken으로도 가능하게 한다(api/public/reviews GET/POST/PATCH/DELETE 모두
  // 이를 지원한다) — 글쓰기/댓글도 관리자 계정으로 그대로 가능하다(ReviewPostFormModal
  // 참고).
  const viewToken = studentApiToken ?? adminApiToken;
  const { t } = useTranslation("reviewBoard");
  const location = useLocation();
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReviewPost | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formParentId, setFormParentId] = useState<string | undefined>(undefined);
  const [formEditingPost, setFormEditingPost] = useState<ReviewPost | null>(null);

  // ReviewPostFormModal이 글을 쓸 때 실제로 저장하는 authorName과 정확히 같은 방식으로
  // 조합해야 "본인 글"을 정확히 식별할 수 있다(신뢰할 수 있는 서버 쪽 studentId 검사는
  // 어차피 PATCH/DELETE 라우트가 다시 하므로, 여기서는 버튼 노출 여부만 결정한다).
  const myAuthorName =
    isRealAccount && studentProfile
      ? studentProfile.englishName
        ? `${studentProfile.name}(${studentProfile.englishName})`
        : studentProfile.name
      : (userName ?? "");
  const canModify = (post: ReviewPost) => post.authorName === myAuthorName;

  const load = () => {
    listBoardPosts(viewToken).then((res) => {
      if (res.ok) setPosts(res.value);
      setLoading(false);
    });
  };

  useEffect(load, [viewToken]);

  // Every fresh navigation to this route (including clicking the "수강후기" nav link
  // while a post is already open, where the path itself doesn't change) gets a new
  // location.key from react-router — reset to the list view so the nav link always
  // lands on the board's main screen instead of leaving a stale detail view showing.
  useEffect(() => {
    setSelected(null);
  }, [location.key]);

  const openDetail = async (id: string) => {
    const res = await getBoardPost(viewToken, id);
    if (res.ok) setSelected(res.value);
    load();
  };

  const backToList = () => {
    setSelected(null);
    load();
  };

  const openNewPost = () => {
    setFormParentId(undefined);
    setFormEditingPost(null);
    setFormOpen(true);
  };
  const openReply = (parentId: string) => {
    setFormParentId(parentId);
    setFormEditingPost(null);
    setFormOpen(true);
  };
  const openEdit = (post: ReviewPost) => {
    setFormParentId(undefined);
    setFormEditingPost(post);
    setFormOpen(true);
  };
  const handleDelete = async (post: ReviewPost) => {
    await deleteBoardPost(studentApiToken, post.id);
    backToList();
  };
  const handleSaved = () => {
    backToList();
  };

  const topLevel = [...posts]
    .filter((p) => !p.parentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows: { post: ReviewPost; isReply: boolean }[] = [];
  for (const top of topLevel) {
    rows.push({ post: top, isReply: false });
    const replies = posts
      .filter((p) => p.parentId === top.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const r of replies) rows.push({ post: r, isReply: true });
  }

  if (!viewToken) {
    return (
      <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          <LogIn size={28} />
        </div>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-500">{t("real_account_required")}</p>
      </Container>
    );
  }

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-4xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} align="left" />

        {!selected && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <p className="text-xs font-bold text-slate-500">{t("total", { count: posts.length })}</p>
              <button
                onClick={openNewPost}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
              >
                <Plus size={14} /> {t("new_post")}
              </button>
            </div>
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="w-14 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("table_headers.no")}
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("table_headers.title")}
                  </th>
                  <th className="w-32 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("table_headers.name")}
                  </th>
                  <th className="w-24 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("table_headers.date")}
                  </th>
                  <th className="w-16 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {t("table_headers.hit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      {t("empty")}
                    </td>
                  </tr>
                )}
                {rows.map(({ post, isReply }, i) => (
                  <tr key={post.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
                    <td className="px-3 py-3 font-mono text-[12px] text-slate-400">{rows.length - i}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => openDetail(post.id)}
                        className={`flex items-center gap-1.5 text-left font-semibold text-brand-950 hover:underline ${isReply ? "pl-5 text-slate-600" : ""}`}
                      >
                        {isReply && <CornerDownRight size={13} className="shrink-0 text-slate-400" />}
                        {post.title || post.content.slice(0, 40)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{post.authorName}</td>
                    <td className="px-3 py-3 font-mono text-[12px] text-slate-400">{formatDate(post.createdAt)}</td>
                    <td className="px-3 py-3 text-slate-400">{post.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-8">
            {selected.title && <h3 className="text-base font-bold text-brand-950">{selected.title}</h3>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 pb-4 text-xs text-slate-400">
              <span>{selected.authorName}</span>
              <span>{selected.createdAt.slice(0, 16).replace("T", " ")}</span>
              <span>{t("detail.hit", { count: selected.views })}</span>
            </div>
            <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-slate-700">{selected.content}</p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={backToList}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                {t("detail.list")}
              </button>
              {!selected.parentId && (
                <button
                  onClick={() => openReply(selected.id)}
                  className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  {t("detail.reply")}
                </button>
              )}
              {canModify(selected) && (
                <>
                  <button
                    onClick={() => openEdit(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Pencil size={14} /> {t("detail.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 size={14} /> {t("detail.delete")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Container>

      <ReviewPostFormModal
        open={formOpen}
        parentId={formParentId}
        editingPost={formEditingPost}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}

export function ReviewBoardPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard allow={["student"]} onOpenLogin={onOpenLogin}>
      <ReviewBoardContent />
    </RouteGuard>
  );
}
