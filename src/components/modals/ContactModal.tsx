import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, MessageCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { CONTACT } from "../../data/contact";

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation("auth");
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
            <Check size={13} /> {t("contact.copied")}
          </>
        ) : (
          <>
            <Copy size={13} /> {t("contact.copy")}
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
  const { t } = useTranslation("auth");
  return (
    <Modal open={open} onClose={onClose} title={t("contact.title")}>
      <div className="flex items-center gap-2 rounded-xl bg-kakao/20 px-4 py-3 text-sm text-brand-950">
        <MessageCircle size={16} className="shrink-0 text-kakao-text" />
        {t("contact.intro")}
      </div>

      <div className="mt-4 space-y-3">
        <CopyRow label={t("contact.kakao_label")} value={CONTACT.kakaoId} />
        <CopyRow label={t("contact.wechat_label")} value={CONTACT.wechatId} />
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        {t("contact.hours_notice")}
      </p>
    </Modal>
  );
}
