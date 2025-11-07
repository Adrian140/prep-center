// FILE: src/main.jsx  (sau src/index.jsx)
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext';
import { SupabaseAuthProvider } from './contexts/SupabaseAuthContext';
import RouteTracker from './analytics/RouteTracker';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <SupabaseAuthProvider>
        <BrowserRouter>
          <RouteTracker />
          <App />
        </BrowserRouter>
      </SupabaseAuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
