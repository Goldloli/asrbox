import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../app/src/App';
import '../../app/src/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
