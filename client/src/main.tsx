import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { animateFavicon } from './favicon';
import './styles.css';

animateFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
