import React from 'react';
import {createRoot} from 'react-dom/client';
import {App,Presentation} from './App';
import {initializeRecovery} from './store';
import './styles.css';
const share=location.pathname.match(/^\/p\/([^/]+)\/?$/);
if(!share)await initializeRecovery();
createRoot(document.getElementById('root')!).render(<React.StrictMode>{share?<Presentation token={share[1]}/>:<App/>}</React.StrictMode>);
