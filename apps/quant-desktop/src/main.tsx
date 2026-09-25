import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Desktop Root element #root was not found in DOM');
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
