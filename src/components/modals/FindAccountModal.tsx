import { useState } from "react";
import { Modal } from "../ui/Modal";
import { CheckCircle2 } from "lucide-react";

export function FindAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"id" | "pw">("id");
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");

  const switchTab = (t: "id" | "pw") => {
    setTab(t);
    setSubmitted(false);
    setName("");
    setContact("");
  };

  const handleClose = () => {
    setSubmitted(false);
    setName("");
    setContact("");
    setTab("id");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) return;
    setSubmitted(true);
  };

  return (
    <Modal open={open} onClose={handleClose} title="아이디 / 비밀번호 찾기">
      <div className="mb-5 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        <button
          onClick={() => switchTab("id")}
          className={`flex-1 rounded-md py-2 transition ${
            tab === "id" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          아이디 찾기
        </button>
        <button
          onClick={() => switchTab("pw")}
          className={`flex-1 rounded-md py-2 transition ${
            tab === "pw" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          비밀번호 찾기
        </button>
      </div>

      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">
            {tab === "id"
              ? "가입 시 등록한 연락처로 아이디 안내를 발송했습니다."
              : "가입 시 등록한 연락처로 비밀번호 재설정 링크를 발송했습니다."}
          </p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            확인
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {tab === "pw" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">
                아이디
              </label>
              <input
                type="text"
                placeholder="아이디를 입력하세요"
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                onChange={(e) => setContact((c) => c || e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              휴대폰 번호
            </label>
            <input
              type="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="'-' 없이 입력하세요"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {tab === "id" ? "아이디 찾기" : "비밀번호 재설정 링크 받기"}
          </button>
        </form>
      )}
    </Modal>
  );
}
