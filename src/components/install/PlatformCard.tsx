import { Monitor, Smartphone, Apple, Video, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MeetingPlatform } from "../../data/meetingPlatforms";
import type { DeviceType } from "../../hooks/useDeviceType";

function DownloadButton({
  href,
  emphasized,
  icon,
  label,
  brandColor,
}: {
  href: string;
  emphasized: boolean;
  icon: React.ReactNode;
  label: string;
  brandColor: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition ${
        emphasized
          ? "text-white shadow-sm hover:opacity-90"
          : "border border-slate-200 text-slate-600 hover:border-brand-300"
      }`}
      style={emphasized ? { backgroundColor: brandColor } : undefined}
    >
      {icon}
      {label}
    </a>
  );
}

export function PlatformCard({
  platform,
  deviceType,
}: {
  platform: MeetingPlatform;
  deviceType: DeviceType;
}) {
  const { t } = useTranslation(["install", "platforms"]);
  const installSteps = t(`platforms:${platform.id}.install_steps`, { returnObjects: true }) as string[];
  const joinSteps = t(`platforms:${platform.id}.join_steps`, { returnObjects: true }) as string[];

  return (
    <div
      id={platform.id}
      className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white"
          style={{ backgroundColor: platform.brandColor }}
        >
          {platform.shortName[0]}
        </div>
        <div>
          <h3 className="text-lg font-bold text-brand-950">{platform.name}</h3>
          <p className="text-xs text-slate-400">
            {t("install:platform_card.official_site")} {platform.officialSiteUrl.replace("https://", "")}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">
        {t(`platforms:${platform.id}.description`)}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <DownloadButton
          href={platform.downloadLinks.pc}
          emphasized={deviceType === "pc"}
          icon={<Monitor size={14} />}
          label={t("install:platform_card.download_pc")}
          brandColor={platform.brandColor}
        />
        <DownloadButton
          href={platform.downloadLinks.android}
          emphasized={deviceType === "android"}
          icon={<Smartphone size={14} />}
          label={t("install:platform_card.download_android")}
          brandColor={platform.brandColor}
        />
        <DownloadButton
          href={platform.downloadLinks.ios}
          emphasized={deviceType === "ios"}
          icon={<Apple size={14} />}
          label={t("install:platform_card.download_ios")}
          brandColor={platform.brandColor}
        />
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <ListChecks size={14} /> {t("install:platform_card.install_steps_title")}
          </p>
          <ol className="space-y-2">
            {installSteps.map((step, i) => (
              <li key={step} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-600">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Video size={14} /> {t("install:platform_card.join_steps_title")}
          </p>
          <ol className="space-y-2">
            {joinSteps.map((step, i) => (
              <li key={step} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[11px] font-bold text-accent-600">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
