import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Non-fatal in sandboxed iframe previews where SW scope may be restricted
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
