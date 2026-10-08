/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/shared/i18n';
import {
  TrainingProvider,
  type TrainingContextValue,
} from '../src/shared/auth/TrainingContext';
import Practice from '../src/features/practice/Practice';
import TrainingHeader from '../src/shared/ui/TrainingHeader';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '../src/shared/ui/theme.css';
const value = {
  teacher: {
    id: 'SYNTHETIC-UNLOCK-QA',
    external_teacher_id: 'SYNTHETIC-UNLOCK-QA',
    display_name: 'QA',
  },
  enrollment_id: 'SYNTHETIC-UNLOCK-QA',
  course: {},
  progress: {},
} as TrainingContextValue;
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <BrowserRouter>
      <TrainingProvider value={value}>
        <div
          style={{ textAlign: 'center', fontSize: 11, background: '#fff6cc' }}
        >
          独立测试账号 · 示例语法题 · 不影响用户成绩
        </div>
        <TrainingHeader />
        <Practice />
      </TrainingProvider>
    </BrowserRouter>
  </LanguageProvider>,
);
