import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { HomeNoticeForm } from "../HomeNoticeForm";
import { updateHomeNotice } from "../actions";

export default async function EditHomeNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noticeId = Number(id);

  const notice = await prisma.homeNotice.findUnique({ where: { id: noticeId } });
  if (!notice || notice.siteId !== DEFAULT_SITE_ID) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">홈페이지 공지 수정</h1>
      <HomeNoticeForm
        action={updateHomeNotice.bind(null, noticeId)}
        defaultTitle={notice.title}
        defaultContent={notice.content}
        defaultPublished={notice.published}
        submitLabel="저장"
      />
    </div>
  );
}
