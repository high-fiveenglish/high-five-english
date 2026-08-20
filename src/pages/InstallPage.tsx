import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { FaqAccordion } from "../components/ui/FaqAccordion";
import { PlatformCard } from "../components/install/PlatformCard";
import { useDeviceType } from "../hooks/useDeviceType";
import { useAuth } from "../context/AuthContext";
import {
  getMyClassroom,
  listMeetingPlatforms,
  type MeetingPlatformRow,
} from "../services/classroomService";
import { INSTALL_FAQ, INSTALL_HERO } from "../data/installContent";

function MyPlatformBanner({ platformName, platformId }: { platformName: string; platformId: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent-200 bg-accent-50/60 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <Sparkles size={18} className="shrink-0 text-accent-500" />
        <p className="text-[14.5px] font-bold text-brand-950">
          내 수업 프로그램: <span className="text-accent-600">{platformName}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          document.getElementById(platformId)?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-600"
      >
        {platformName} 설치 방법 보기
      </button>
    </div>
  );
}

export function InstallPage() {
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
      <section className="bg-gradient-to-b from-brand-50 via-white to-white py-14 sm:py-16">
        <Container className="max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-600/10 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            {INSTALL_HERO.eyebrow}
          </span>
          <h1 className="mt-4 text-[1.6rem] font-extrabold leading-tight text-brand-950 sm:text-3xl">
            {INSTALL_HERO.title}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
            {INSTALL_HERO.description}
          </p>
        </Container>

        {isLoggedIn && myPlatformName && myPlatformId && (
          <Container className="mt-8">
            <MyPlatformBanner platformName={myPlatformName} platformId={myPlatformId} />
          </Container>
        )}
      </section>

      <section className="py-16 sm:py-20">
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
          <SectionHeading eyebrow="FAQ" title="자주 묻는 질문" align="left" />
          <div className="mt-8">
            <FaqAccordion items={INSTALL_FAQ} />
          </div>
        </Container>
      </section>
    </>
  );
}
