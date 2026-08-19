import { useState } from "react";
import { Modal } from "../ui/Modal";
import { CheckCircle2 } from "lucide-react";

const AGE_GROUPS = ["유아", "초등", "중등", "고등", "성인"];

export function LevelTestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact: "",
    ageGroup: "초등",
    time: "",
  });

  const handleClose = () => {
    setSubmitted(false);
    setForm({ name: "", contact: "", ageGroup: "초등", time: "" });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.contact.trim()) return;
    setSubmitted(true);
  };

  return (
    <Modal open={open} onClose={handleClose} title="무료 레벨테스트 신청">
      {submitted ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="text-accent-500" size={40} />
          <p className="text-sm text-slate-600">
            신청이 접수되었습니다.
            <br />
            영업일 기준 1일 이내 담당 상담원이 연락드립니다.
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
          <p className="mb-1 text-sm leading-relaxed text-slate-500">
            간단한 정보를 남겨주시면 전문 상담원이 무료 레벨테스트 일정을
            안내해드립니다.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              이름 (또는 자녀 이름)
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="이름을 입력하세요"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              연락처
            </label>
            <input
              type="tel"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="'-' 없이 입력하세요"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              연령대
            </label>
            <div className="flex flex-wrap gap-2">
              {AGE_GROUPS.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setForm({ ...form, ageGroup: g })}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                    form.ageGroup === g
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 text-slate-500 hover:border-brand-300"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              희망 상담 시간대 (선택)
            </label>
            <input
              type="text"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              placeholder="예: 평일 오후 3시 이후"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-lg bg-accent-500 py-3 text-sm font-semibold text-white transition hover:bg-accent-600"
          >
            무료 레벨테스트 신청하기
          </button>
        </form>
      )}
    </Modal>
  );
}
