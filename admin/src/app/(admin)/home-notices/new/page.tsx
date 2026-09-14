import { HomeNoticeForm } from "../HomeNoticeForm";
import { createHomeNotice } from "../actions";

export default function NewHomeNoticePage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">홈페이지 공지 작성</h1>
      <HomeNoticeForm action={createHomeNotice} submitLabel="등록" />
    </div>
  );
}
