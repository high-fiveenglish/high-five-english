import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, ExternalLink } from "lucide-react";
import { listActiveConsultChannels } from "../../services/consultChannelService";
import type { ConsultChannel } from "../../lib/community/types";

function ChannelRow({ channel }: { channel: ConsultChannel }) {
  const { t } = useTranslation("auth");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(channel.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable; user can still select the text manually
    }
  };

  // The button/heading phrase is translated per-language via i18n, keyed by channel id
  // (matches the ko/zh/vi wording examples in the spec) — channel.displayName is the
  // admin's own reference label (shown in the admin table), not the public-facing text,
  // but doubles as a graceful fallback for a future channel id with no translation yet.
  const label = t(`contact.channel_cta.${channel.id}`, { defaultValue: channel.displayName });

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-brand-950">{channel.value}</p>
        {!channel.url && (
          <p className="mt-1 text-[11px] text-slate-400">{t("contact.no_link_notice")}</p>
        )}
      </div>
      {channel.url ? (
        <a
          href={channel.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <ExternalLink size={13} /> {label}
        </a>
      ) : (
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 shadow-sm transition hover:bg-brand-50"
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
      )}
    </div>
  );
}

/** Shared between ContactModal (opened from Footer/FloatingSideButtons) and ConsultPage
 * (the "1:1 상담" nav destination, /counsel) — both show the same live channel list, so
 * the fetch + row rendering logic lives here once. Channels the admin has disabled never
 * reach this list at all (listActiveConsultChannels filters them server-side). */
export function ConsultChannelList() {
  const [channels, setChannels] = useState<ConsultChannel[]>([]);

  useEffect(() => {
    listActiveConsultChannels().then(setChannels);
  }, []);

  return (
    <div className="space-y-3">
      {channels.map((c) => (
        <ChannelRow key={c.id} channel={c} />
      ))}
    </div>
  );
}
