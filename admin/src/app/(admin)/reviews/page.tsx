import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteReviewPost } from "./actions";
import { formatAppDateTime } from "@/lib/appTime";
import { ReviewViewsForm } from "./ReviewViewsForm";

export default async function ReviewsPage() {
  const posts = await prisma.reviewPost.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { createdAt: "desc" },
    include: { student: true },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">수강후기 게시판</h1>
        <p className="mt-1 text-sm text-slate-500">
          마케팅 사이트에 로그인한 학생만 볼 수 있는 게시판입니다. 부적절한 글은 여기서 삭제할 수 있습니다.
        </p>
      </div>

      <div className="space-y-3">
        {posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {p.parentId && <span className="mr-1 font-normal text-slate-400">RE</span>}
                  {p.title || <span className="font-normal italic text-slate-400">(제목 없음)</span>}
                  <span className="ml-2 font-normal text-slate-400">{p.student?.name ?? p.authorAdminName ?? "관리자"}</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{formatAppDateTime(p.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <ReviewViewsForm id={p.id} views={p.views} />
                <DeleteButton action={deleteReviewPost.bind(null, p.id)} />
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-600">{p.content}</p>
          </div>
        ))}
        {posts.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
            등록된 게시글이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
