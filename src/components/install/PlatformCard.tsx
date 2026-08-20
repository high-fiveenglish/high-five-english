import { Monitor, Smartphone, Apple, Video, ListChecks } from "lucide-react";
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
  return (
    <div
      id={platform.id}
      className="scroll-mt-28 rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7"
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
          <p className="text-xs text-slate-400">공식 사이트: {platform.officialSiteUrl.replace("https://", "")}</p>
        </div>
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">{platform.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <DownloadButton
          href={platform.downloadLinks.pc}
          emphasized={deviceType === "pc"}
          icon={<Monitor size={14} />}
          label="PC 다운로드"
          brandColor={platform.brandColor}
        />
        <DownloadButton
          href={platform.downloadLinks.android}
          emphasized={deviceType === "android"}
          icon={<Smartphone size={14} />}
          label="Android 다운로드"
          brandColor={platform.brandColor}
        />
        <DownloadButton
          href={platform.downloadLinks.ios}
          emphasized={deviceType === "ios"}
          icon={<Apple size={14} />}
          label="iPhone/iPad 다운로드"
          brandColor={platform.brandColor}
        />
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <ListChecks size={14} /> 설치 방법
          </p>
          <ol className="space-y-2">
            {platform.installSteps.map((step, i) => (
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
            <Video size={14} /> 수업 참여 방법
          </p>
          <ol className="space-y-2">
            {platform.joinSteps.map((step, i) => (
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
