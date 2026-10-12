import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// tema antes del primer paint (sin flash) — el mismo triplete que el cliente viejo
document.documentElement.setAttribute('data-theme', localStorage.getItem('biblioteca-theme') || 'dark');

createRoot(document.getElementById('root')).render(<App />);
