import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { FloatingSideButtons } from "./components/layout/FloatingSideButtons";
import { ScrollToHash } from "./components/layout/ScrollToHash";
import { LangLayout, RootRedirect } from "./components/i18n/LangLayout";
import { LevelTestModal } from "./components/modals/LevelTestModal";
import { ContactModal } from "./components/modals/ContactModal";
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";
import { ProgramPage } from "./pages/ProgramPage";
import { CurriculumPage } from "./pages/CurriculumPage";
import { ProcessPage } from "./pages/ProcessPage";
import { ClassroomPage } from "./pages/ClassroomPage";
import { AdminReschedulePage } from "./pages/AdminReschedulePage";
import { InstallPage } from "./pages/InstallPage";
import { LegalPage } from "./pages/LegalPage";
import { NoticeListPage } from "./pages/NoticeListPage";
import { AdminMeetingSettingsPage } from "./pages/AdminMeetingSettingsPage";
import { AdminAccountsPage } from "./pages/AdminAccountsPage";
import { AdminNoticesPage } from "./pages/AdminNoticesPage";
import { AdminReviewsPage } from "./pages/AdminReviewsPage";
import { AdminLevelTestPage } from "./pages/AdminLevelTestPage";
import { AdminPricingPage } from "./pages/AdminPricingPage";
import { AdminInstructorsPage } from "./pages/AdminInstructorsPage";
import { AdminConsultChannelsPage } from "./pages/AdminConsultChannelsPage";
import { ConsultPage } from "./pages/ConsultPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { RouteGuard } from "./components/auth/RouteGuard";
import { PlaceholderPage } from "./pages/PlaceholderPage";

function App() {
  const [levelTestOpen, setLevelTestOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const openLevelTest = () => setLevelTestOpen(true);
  const openLogin = () => setLoginOpen(true);
  const { t } = useTranslation(["common", "admin"]);

  return (
    <AuthProvider>
      <LanguageProvider>
        <ScrollToHash />
        <div className="flex min-h-screen flex-col">
          <Header
            loginOpen={loginOpen}
            onOpenLogin={openLogin}
            onCloseLogin={() => setLoginOpen(false)}
          />

          <main className="flex-1">
            <Routes>
              {/* Public/marketing pages: locale-prefixed for SEO (see src/i18n/paths.ts). */}
              <Route path="/" element={<RootRedirect />} />
              <Route path="/:lang" element={<LangLayout />}>
                <Route index element={<HomePage onOpenLevelTest={openLevelTest} />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="program" element={<ProgramPage onOpenLevelTest={openLevelTest} />} />
                <Route
                  path="curriculum"
                  element={<CurriculumPage onOpenLevelTest={openLevelTest} />}
                />
                <Route path="process" element={<ProcessPage onOpenLevelTest={openLevelTest} />} />
                <Route path="install" element={<InstallPage />} />
                <Route path="notice" element={<NoticeListPage />} />
                <Route path="counsel" element={<ConsultPage />} />
                <Route path="terms" element={<LegalPage doc="terms" path="/terms" />} />
                <Route path="privacy" element={<LegalPage doc="privacy" path="/privacy" />} />
              </Route>

              {/* Protected pages: never indexed, so no locale prefix — language comes
                  from the logged-in account's own preference (LanguageContext). */}
              <Route
                path="/classroom"
                element={<ClassroomPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/teacher"
                element={<TeacherDashboardPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin"
                element={
                  <RouteGuard allow={["general_manager", "general_admin"]} onOpenLogin={openLogin}>
                    <PlaceholderPage
                      title={t("admin:home.title")}
                      links={[
                        { label: t("admin:home.link_reschedule"), to: "/admin/reschedule-requests" },
                        { label: t("admin:home.link_meeting_settings"), to: "/admin/meeting-settings" },
                        { label: t("admin:home.link_accounts"), to: "/admin/accounts" },
                        { label: t("admin:home.link_notices"), to: "/admin/notices" },
                        { label: t("admin:home.link_reviews"), to: "/admin/reviews" },
                        { label: t("admin:home.link_level_test"), to: "/admin/level-test-requests" },
                        { label: t("admin:home.link_pricing"), to: "/admin/pricing" },
                        { label: t("admin:home.link_instructors"), to: "/admin/instructors" },
                        { label: t("admin:home.link_consult_channels"), to: "/admin/consult-channels" },
                      ]}
                    />
                  </RouteGuard>
                }
              />
              <Route
                path="/admin/reschedule-requests"
                element={<AdminReschedulePage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/meeting-settings"
                element={<AdminMeetingSettingsPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/accounts"
                element={<AdminAccountsPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/notices"
                element={<AdminNoticesPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/reviews"
                element={<AdminReviewsPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/level-test-requests"
                element={<AdminLevelTestPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/pricing"
                element={<AdminPricingPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/instructors"
                element={<AdminInstructorsPage onOpenLogin={openLogin} />}
              />
              <Route
                path="/admin/consult-channels"
                element={<AdminConsultChannelsPage onOpenLogin={openLogin} />}
              />
              <Route path="/mypage" element={<PlaceholderPage title={t("topbar.my_info")} />} />
              <Route path="*" element={<PlaceholderPage title={t("errors.not_found_title")} />} />
            </Routes>
          </main>

          <Footer onOpenContact={() => setContactOpen(true)} />
          <FloatingSideButtons
            onOpenLevelTest={openLevelTest}
            onOpenContact={() => setContactOpen(true)}
          />
        </div>

        <LevelTestModal open={levelTestOpen} onClose={() => setLevelTestOpen(false)} />
        <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
