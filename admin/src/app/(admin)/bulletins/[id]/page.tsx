import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { BulletinForm } from "../BulletinForm";
import { updateBulletin } from "../actions";

export default async function EditBulletinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bulletinId = Number(id);

  const bulletin = await prisma.bulletin.findUnique({ where: { id: bulletinId } });
  // 다른 site의 공지를 id 조작으로 열람/수정할 수 없도록 siteId까지 확인한다.
  if (!bulletin || bulletin.siteId !== DEFAULT_SITE_ID) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">공지 수정</h1>
      <BulletinForm
        action={updateBulletin.bind(null, bulletinId)}
        defaultTitle={bulletin.title}
        defaultContent={bulletin.content}
        submitLabel="저장"
      />
    </div>
  );
}
