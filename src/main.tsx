import {createRoot} from 'react-dom/client';
import './firebase';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
