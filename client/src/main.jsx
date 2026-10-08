import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { BROWSER_MODE } from './api.js';
import App from './App.jsx';
import { ToastProvider } from './components/ui.jsx';
import 'highlight.js/styles/github.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/repos.css';
import './styles/boards.css';
import './styles/wiki.css';

// GitHub Pages can't rewrite deep links to index.html, so the static build uses #/ URLs.
const Router = BROWSER_MODE ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Router>
  </React.StrictMode>,
);
