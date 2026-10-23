import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { configureBattleData } from '@shared/data/battleData';
import { App } from './App';
import './styles.css';

// Responses stay in memory for the session; the API rules allow caching, not mirroring.
configureBattleData({ cacheTtlMs: 60 * 60_000 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
