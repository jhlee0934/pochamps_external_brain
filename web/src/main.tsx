import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { configureBattleData } from '@shared/data/battleData';
import { App } from './App';
import './styles.css';

// Responses stay in memory for the session; the API rules allow caching, not mirroring.
configureBattleData({ cacheTtlMs: 60 * 60_000 });

// Pages cannot rewrite nested URLs to index.html. Hash routes survive refreshes.
const Router = import.meta.env.VITE_ROUTER_MODE === 'hash' ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
