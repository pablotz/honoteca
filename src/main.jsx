import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Login from './components/Login.jsx';
import { language } from './lib/i18n.js';
import './index.css';

// tema antes del primer paint (sin flash) — el mismo triplete que el cliente viejo
document.documentElement.setAttribute('data-theme', localStorage.getItem('biblioteca-theme') || 'dark');
document.documentElement.lang = language;

const previewLogin = import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'login';
createRoot(document.getElementById('root')).render(previewLogin ? <Login mail={false} /> : <App />);
