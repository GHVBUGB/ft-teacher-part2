import React, { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
  Link,
  Outlet,
  useNavigate,
} from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '../shared/ui/theme.css';
import { api, queryKeys, DEMO_ENROLLMENT_ID } from '../shared/api/client';
import { TrainingProvider } from '../shared/auth/TrainingContext';
import TrainingIntro from '../features/practice/TrainingIntro';
import Login from '../features/login/Login';
import { useStageTraining } from '../features/practice/useStageTraining';
import { stageItems } from '../features/practice/lib/stageCatalog';
import { CONTENT_VERSION } from '../features/practice/lib/catalog';
import { useTraining } from '../shared/auth/TrainingContext';
import TrainingHeader from '../shared/ui/TrainingHeader';
import { LanguageProvider, useI18n } from '../shared/i18n';
const Practice = lazy(() => import('../features/practice/Practice'));

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: false } },
});
function RouteViewport() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}
function TrainingShell() {
  const { t } = useI18n();
  const { enrollmentId = DEMO_ENROLLMENT_ID } = useParams();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api.me(signal),
  });
  const course = useQuery({
    queryKey: queryKeys.course(enrollmentId),
    queryFn: ({ signal }) => api.course(enrollmentId, signal),
  });
  const progress = useQuery({
    queryKey: queryKeys.progress(enrollmentId),
    queryFn: ({ signal }) => api.progress(enrollmentId, signal),
  });
  if (me.isError || course.isError || progress.isError)
    return (
      <main className="shell-notice">
        <h1>{t('培训暂时不可用')}</h1>
        <p>{String((me.error || course.error || progress.error)?.message)}</p>
        <Link to="/">{t('返回演示页')}</Link>
      </main>
    );
  if (!me.data || !course.data || !progress.data)
    return (
      <main className="shell-notice">
        <output>{t('正在加载培训…')}</output>
      </main>
    );
  if (!progress.data.parts.find((p) => p.part_key === 'practice')?.can_enter)
    return (
      <main className="shell-notice">
        <h1>{t('该模块暂未开放。')}</h1>
      </main>
    );
  return (
    <TrainingProvider
      value={{
        teacher: me.data,
        enrollment_id: enrollmentId,
        course: course.data,
        progress: progress.data,
      }}
    >
      <TrainingHeader />
      <Outlet key={enrollmentId} />
    </TrainingProvider>
  );
}
function Introduction() {
  const training = useTraining();
  const location = useLocation();
  const navigate = useNavigate();
  const stage = useStageTraining({
    teacherId: training.teacher.id,
    enrollmentId: training.enrollment_id,
    contentVersion: CONTENT_VERSION,
  }, stageItems, new URLSearchParams(location.search).get('test') === 'acceptance' ? 'acceptance' : '');
  return <TrainingIntro
    wordComplete={stage.status.word.complete}
    pronunciationComplete={stage.status.pronunciationComplete}
    onStart={() => navigate(`/training/${training.enrollment_id}/practice/room${location.search}${window.location.hash}`)}
  />;
}
function PracticeLoading() {
  const { t } = useI18n();
  return <main className="shell-notice"><output>{t('正在加载培训…')}</output></main>;
}
function Home() {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/login${location.search}`}
    />
  );
}
function OrientationBoundary() {
  const { t } = useI18n();
  const {enrollmentId=DEMO_ENROLLMENT_ID}=useParams();
  return (
    <main className="shell-notice">
      <h1>{t('岗前培训')}</h1>
      <p>
        {t('第一部分由岗前培训模块负责，目前尚未接入。')}
      </p>
      <Link to={`/training/${enrollmentId}/practice`}>{t('进入练习')}</Link>
    </main>
  );
}
function NotFound() {
  const { t } = useI18n();
  return <main className="shell-notice"><h1>{t('页面不存在')}</h1><Link to="/">{t('返回培训')}</Link></main>;
}
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <RouteViewport />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/training/:enrollmentId/practice"
          element={<TrainingShell />}
        >
          <Route index element={<Introduction />} />
          <Route path="room" element={<Suspense fallback={<PracticeLoading />}><Practice /></Suspense>} />
        </Route>
        <Route
          path="/training/:enrollmentId/orientation"
          element={<OrientationBoundary />}
        />
        <Route
          path="*"
          element={
            <NotFound />
          }
        />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
  </LanguageProvider>,
);
