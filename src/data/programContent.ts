import type { TFunction } from "i18next";

type ComparePoint = { label: string; points: string[] };
type CompareData = { left: ComparePoint; right: ComparePoint };

export function getHero(t: TFunction) {
  return {
    eyebrow: t("hero.eyebrow"),
    headline: t("hero.headline"),
    sub: t("hero.sub"),
  };
}

export function getOutputSection(t: TFunction) {
  return {
    eyebrow: t("output.eyebrow"),
    title: t("output.title"),
    lead: t("output.lead"),
    body: t("output.body"),
    compare: t("output.compare", { returnObjects: true }) as CompareData,
    highlight: t("output.highlight"),
    closing: t("output.closing"),
  };
}

export function getAiSection(t: TFunction) {
  return {
    eyebrow: t("ai.eyebrow"),
    title: t("ai.title"),
    lead: t("ai.lead"),
    body: t("ai.body"),
    body2: t("ai.body2"),
    compare: t("ai.compare", { returnObjects: true }) as CompareData,
    highlight: t("ai.highlight"),
  };
}

export function getStrengthsTitle(t: TFunction) {
  return t("strengthsTitle") as string;
}

export function getStrengths(t: TFunction) {
  return t("strengths", { returnObjects: true }) as Array<{
    badge: string;
    title: string;
    body: string;
  }>;
}

export function getFeedbackStrength(t: TFunction) {
  return {
    badge: t("feedbackStrength.badge"),
    title: t("feedbackStrength.title"),
    body: t("feedbackStrength.body"),
    items: t("feedbackStrength.items", { returnObjects: true }) as string[],
    closing: t("feedbackStrength.closing"),
  };
}

export function getClosingCta(t: TFunction) {
  return {
    title: t("closingCta.title"),
    body: t("closingCta.body"),
  };
}
