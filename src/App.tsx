import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { FloatingSideButtons } from "./components/layout/FloatingSideButtons";
import { ScrollToHash } from "./components/layout/ScrollToHash";
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
import { AdminMeetingSettingsPage } from "./pages/AdminMeetingSettingsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

function App() {
  const [levelTestOpen, setLevelTestOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const openLevelTest = () => setLevelTestOpen(true);
  const openLogin = () => setLoginOpen(true);

  return (
    <AuthProvider>
      <ScrollToHash />
      <div className="flex min-h-screen flex-col">
        <Header
          loginOpen={loginOpen}
          onOpenLogin={openLogin}
          onCloseLogin={() => setLoginOpen(false)}
        />

        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage onOpenLevelTest={openLevelTest} />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/program" element={<ProgramPage onOpenLevelTest={openLevelTest} />} />
            <Route
              path="/curriculum"
              element={<CurriculumPage onOpenLevelTest={openLevelTest} />}
            />
            <Route
              path="/process"
              element={<ProcessPage onOpenLevelTest={openLevelTest} />}
            />
            <Route
              path="/classroom"
              element={<ClassroomPage onOpenLogin={openLogin} />}
            />
            <Route path="/notice" element={<PlaceholderPage title="공지사항" />} />
            <Route path="/counsel" element={<PlaceholderPage title="1:1 상담" />} />
            <Route
              path="/admin"
              element={
                <PlaceholderPage
                  title="홈페이지 관리"
                  links={[
                    { label: "수업 연기 신청 내역 보기", to: "/admin/reschedule-requests" },
                    { label: "화상회의 프로그램 설정", to: "/admin/meeting-settings" },
                  ]}
                />
              }
            />
            <Route path="/admin/reschedule-requests" element={<AdminReschedulePage />} />
            <Route path="/admin/meeting-settings" element={<AdminMeetingSettingsPage />} />
            <Route path="/mypage" element={<PlaceholderPage title="정보변경" />} />
            <Route path="/install" element={<InstallPage />} />
            <Route path="*" element={<PlaceholderPage title="페이지를 찾을 수 없습니다" />} />
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
    </AuthProvider>
  );
}

export default App;
