import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth, SessionProvider } from './lib/session';
import { AccountPage } from './pages/AccountPage';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { InterviewRoomPage } from './pages/InterviewRoomPage';
import { NewInterviewPage } from './pages/NewInterviewPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ResultPage } from './pages/ResultPage';

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<AuthPage />} />
          <Route path="/privacidade" element={<PrivacyPage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/nova" element={<NewInterviewPage />} />
            <Route path="/entrevista" element={<InterviewRoomPage />} />
            <Route path="/resultado/:id" element={<ResultPage />} />
            <Route path="/conta" element={<AccountPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
