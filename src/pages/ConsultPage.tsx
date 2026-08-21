import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { SeoHead } from "../components/seo/SeoHead";
import { ConsultChannelList } from "../components/contact/ConsultChannelList";

export function ConsultPage() {
  const { t } = useTranslation(["auth", "common"]);

  return (
    <section className="bg-slate-50/60 py-14 sm:py-20">
      <SeoHead
        titleKey="contact.meta_title"
        descriptionKey="contact.intro"
        ns="auth"
        path="/counsel"
      />
      <Container className="max-w-xl">
        <SectionHeading eyebrow={t("nav.counsel", { ns: "common" })} title={t("contact.title")} align="left" />
        <p className="mt-4 text-sm leading-relaxed text-slate-500">{t("contact.intro")}</p>

        <div className="mt-8">
          <ConsultChannelList />
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">{t("contact.hours_notice")}</p>
      </Container>
    </section>
  );
}
