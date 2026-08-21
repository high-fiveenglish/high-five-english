import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { FaqAccordion, type FaqEntry } from "../components/ui/FaqAccordion";
import { PlatformCard } from "../components/install/PlatformCard";
import { SeoHead } from "../components/seo/SeoHead";
import { useDeviceType } from "../hooks/useDeviceType";
import { useAuth } from "../context/AuthContext";
import {
  getMyClassroom,
  listMeetingPlatforms,
  type MeetingPlatformRow,
} from "../services/classroomService";

function MyPlatformBanner({ platformName, platformId }: { platformName: string; platformId: string }) {
  const { t } = useTranslation("install");
  return (
    <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent-200 bg-accent-50/60 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <Sparkles size={18} className="shrink-0 text-accent-500" />
        <p className="text-[14.5px] font-bold text-brand-950">
          {t("banner.label")} <span className="text-accent-600">{platformName}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          document.getElementById(platformId)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-600"
      >
        {t("banner.button", { platform: platformName })}
      </button>
    </div>
  );
}

export function InstallPage() {
  const { t } = useTranslation("install");
  const { isLoggedIn, actor } = useAuth();
  const [myPlatformId, setMyPlatformId] = useState<string | null>(null);
  const [myPlatformName, setMyPlatformName] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<MeetingPlatformRow[]>([]);
  const deviceType = useDeviceType();

  useEffect(() => {
    listMeetingPlatforms().then(setPlatforms);
  }, []);

  useEffect(() => {
    // No need to reset state when logged out: the banner only renders while
    // isLoggedIn is true, so stale values are simply never read after logout.
    if (!isLoggedIn || !actor || actor.role !== "student") return;
    getMyClassroom(actor).then((res) => {
      if (!res.ok) return;
      const platform = platforms.find((p) => p.id === res.value.enrollment.meetingPlatform);
      setMyPlatformId(res.value.enrollment.meetingPlatform);
      setMyPlatformName(platform?.name ?? res.value.enrollment.meetingPlatform);
    });
  }, [isLoggedIn, actor, platforms]);

  return (
    <>
      <SeoHead titleKey="meta.title" descriptionKey="meta.description" ns="install" path="/install" />
      <section className="bg-gradient-to-b from-brand-50 via-white to-white pt-14 pb-6 sm:pt-16 sm:pb-8">
        <Container className="max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            {t("hero.eyebrow")}
          </span>
          <h1 className="mt-4 text-[1.6rem] font-extrabold leading-tight text-brand-950 sm:text-3xl">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
            {t("hero.description")}
          </p>
        </Container>

        {isLoggedIn && myPlatformName && myPlatformId && (
          <Container className="mt-8">
            <MyPlatformBanner platformName={myPlatformName} platformId={myPlatformId} />
          </Container>
        )}
      </section>

      <section className="pt-8 pb-16 sm:pt-10 sm:pb-20">
        <Container className="max-w-3xl space-y-6">
          {platforms
            .filter((p) => p.enabled)
            .map((platform) => (
              <PlatformCard key={platform.id} platform={platform} deviceType={deviceType} />
            ))}
        </Container>
      </section>

      <section className="bg-brand-50/60 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <SectionHeading
            eyebrow={t("faq_section.eyebrow")}
            title={t("faq_section.title")}
            align="left"
          />
          <div className="mt-8">
            <FaqAccordion items={t("faq", { returnObjects: true }) as FaqEntry[]} />
          </div>
        </Container>
      </section>
    </>
  );
}
