import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { AdminHomeNoticeFormModal } from "../components/modals/AdminHomeNoticeFormModal";
import { useAuth } from "../context/AuthContext";
import { listPublishedHomeNotices, getPublishedHomeNotice, deleteHomeNotice } from "../services/homeNoticeService";
import type { HomeNotice } from "../lib/community/types";

function formatDate(iso: string) {
  return iso.slice(2, 10);
}

function NoticeBoardContent() {
  const { adminApiToken } = useAuth();
  const { t } = useTranslation("noticeBoard");
  const location = useLocation();
  const [notices, setNotices] = useState<HomeNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HomeNotice | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formEditing, setFormEditing] = useState<HomeNotice | null>(null);

  // 실제로 글이 쓰이려면 admin 실제 DB에 연결된 adminApiToken이 있어야 한다(관리자
  // 로그인 아이디/비밀번호가 실제 AdminUser와 일치했을 때만 발급됨) — 데모 계정
  // role/permission만으로는 더 이상 판단할 수 없다(실제 글쓰기가 항상 성공한다는
  // 보장이 없기 때문).
  const writable = !!adminApiToken;

  const load = () => {
    listPublishedHomeNotices().then((res) => {
      setNotices(res);
      setLoading(false);
    });
  };

  useEffect(load, []);

  // Every fresh navigation to this route (including clicking the "공지사항" nav link
  // while a notice is already open) gets a new location.key from react-router — reset
  // to the list view, matching ReviewBoardPage's same fix.
  useEffect(() => {
    setSelected(null);
  }, [location.key]);

  const openDetail = async (id: string) => {
    const notice = await getPublishedHomeNotice(id);
    if (notice) setSelected(notice);
    load();
  };

  const backToList = () => {
    setSelected(null);
    load();
  };

  const openNewPost = () => {
    setFormEditing(null);
    setFormOpen(true);
  };
  const openEdit = (notice: HomeNotice) => {
    setFormEditing(notice);
    setFormOpen(true);
  };
  const handleDelete = async (notice: HomeNotice) => {
    await deleteHomeNotice(adminApiToken, notice.id);
    backToList();
  };

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-4xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} align="left" />

        {!selected && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <p className="text-xs font-bold text-slate-500">{t("total", { count: notices.length })}</p>
              {writable && (
                <button
                  onClick={openNewPost}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
                >
                  <Plus size={14} /> {t("new_post")}
                </button>
              )}
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
                {!loading && notices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      {t("empty")}
                    </td>
                  </tr>
                )}
                {notices.map((notice, i) => (
                  <tr key={notice.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/30">
                    <td className="px-3 py-3 font-mono text-[12px] text-slate-400">{notices.length - i}</td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => openDetail(notice.id)}
                        className="text-left font-semibold text-brand-950 hover:underline"
                      >
                        {notice.title}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{notice.authorName}</td>
                    <td className="px-3 py-3 font-mono text-[12px] text-slate-400">{formatDate(notice.createdAt)}</td>
                    <td className="px-3 py-3 text-slate-400">{notice.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-8">
            <h3 className="text-base font-bold text-brand-950">{selected.title}</h3>
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
              {writable && (
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

      <AdminHomeNoticeFormModal
        open={formOpen}
        notice={formEditing}
        onClose={() => setFormOpen(false)}
        onSaved={backToList}
      />
    </section>
  );
}

export function NoticeBoardPage() {
  return <NoticeBoardContent />;
}
