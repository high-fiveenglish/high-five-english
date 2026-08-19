import { Hero } from "../components/home/Hero";
import { AboutTeaserSection } from "../components/home/AboutTeaserSection";
import { InstructorsSection } from "../components/home/InstructorsSection";
import { LearningSystemSection } from "../components/home/LearningSystemSection";
import { ProcessSection } from "../components/home/ProcessSection";
import { ReviewsSection } from "../components/home/ReviewsSection";
import { WhyUsSection } from "../components/home/WhyUsSection";
import { PricingSection } from "../components/home/PricingSection";

export function HomePage({
  onOpenLevelTest,
}: {
  onOpenLevelTest: () => void;
}) {
  return (
    <>
      <Hero onOpenLevelTest={onOpenLevelTest} />
      <AboutTeaserSection />
      <InstructorsSection />
      <LearningSystemSection />
      <ProcessSection onOpenLevelTest={onOpenLevelTest} />
      <ReviewsSection />
      <WhyUsSection />
      <PricingSection onOpenLevelTest={onOpenLevelTest} />
    </>
  );
}
