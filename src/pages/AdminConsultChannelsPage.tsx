import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { useAuth } from "../context/AuthContext";
import { listAllConsultChannels, updateConsultChannel } from "../services/consultChannelService";
import type { ConsultChannel } from "../lib/community/types";
import type { Actor } from "../lib/auth/types";

function ChannelRow({ actor, channel, onSaved }: { actor: Actor; channel: ConsultChannel; onSaved: () => void }) {
  const { t } = useTranslation("admin");
  const [displayName, setDisplayName] = useState(channel.displayName);
  const [value, setValue] = useState(channel.value);
  const [url, setUrl] = useState(channel.url ?? "");
  const [enabled, setEnabled] = useState(channel.enabled);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(channel.displayName);
    setValue(channel.value);
    setUrl(channel.url ?? "");
    setEnabled(channel.enabled);
  }, [channel]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await updateConsultChannel(actor, channel.id, { displayName, value, url, enabled });
    setSaving(false);
    if (!result.ok) {
      setError(
        t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }),
      );
      return;
    }
    onSaved();
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {t("consult_channels.field_display_name")}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {t("consult_channels.field_value")}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {t("consult_channels.field_url")}
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <label className="flex items-center gap-1.5 self-end pb-2.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          {t("consult_channels.field_enabled")}
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 self-end rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          <Save size={13} /> {saving ? t("consult_channels.saving") : t("consult_channels.save")}
        </button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
}

function AdminConsultChannelsContent() {
  const { actor } = useAuth();
  const { t } = useTranslation("admin");
  const [channels, setChannels] = useState<ConsultChannel[]>([]);

  const load = () => {
    if (!actor) return;
    listAllConsultChannels(actor).then((res) => {
      if (res.ok) setChannels(res.value);
    });
  };

  useEffect(load, [actor]);

  if (!actor) return null;

  return (
    <section className="bg-slate-50/60 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("consult_channels.admin_title")} align="left" />
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          {t("consult_channels.admin_description")}
        </p>

        <div className="mt-6 space-y-3">
          {channels.map((c) => (
            <ChannelRow key={c.id} actor={actor} channel={c} onSaved={load} />
          ))}
        </div>
      </Container>
    </section>
  );
}

export function AdminConsultChannelsPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard
      allow={["general_manager", "general_admin"]}
      requirePermission="siteSettings"
      onOpenLogin={onOpenLogin}
    >
      <AdminConsultChannelsContent />
    </RouteGuard>
  );
}
