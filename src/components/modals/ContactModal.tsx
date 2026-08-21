import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { ConsultChannelList } from "../contact/ConsultChannelList";

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

      <div className="mt-4">
        <ConsultChannelList />
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        {t("contact.hours_notice")}
      </p>
    </Modal>
  );
}
