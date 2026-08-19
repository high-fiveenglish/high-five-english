import { useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { CONTACT } from "../../data/contact";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable; user can still select the text manually
    }
  };

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5">
      <div>
        <p className="text-xs font-semibold text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-brand-950">{value}</p>
      </div>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-50"
      >
        {copied ? (
          <>
            <Check size={13} /> 복사됨
          </>
        ) : (
          <>
            <Copy size={13} /> 복사
          </>
        )}
      </button>
    </div>
  );
}

export function ContactModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="카카오톡 · 위챗 상담">
      <div className="flex items-center gap-2 rounded-xl bg-kakao/20 px-4 py-3 text-sm text-brand-950">
        <MessageCircle size={16} className="shrink-0 text-kakao-text" />
        카카오톡 또는 위챗 앱에서 아래 ID를 검색해 친구 추가 후 상담해 주세요.
      </div>

      <div className="mt-4 space-y-3">
        <CopyRow label="카카오톡 ID" value={CONTACT.kakaoId} />
        <CopyRow label="WeChat ID" value={CONTACT.wechatId} />
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        평일 09:00 – 18:00 사이 문의 주시면 빠르게 답변드립니다.
      </p>
    </Modal>
  );
}
