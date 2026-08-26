import { BulletinForm } from "../BulletinForm";
import { createBulletin } from "../actions";

export default function NewBulletinPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">공지 작성</h1>
      <BulletinForm action={createBulletin} submitLabel="등록" />
    </div>
  );
}
