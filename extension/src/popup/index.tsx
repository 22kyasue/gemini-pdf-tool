import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../sidepanel/sidepanel.css';
import { PopupApp } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
