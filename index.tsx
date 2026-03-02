import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress benign unhandled rejections from video play() interruptions
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && typeof event.reason === 'object' && Object.keys(event.reason).length === 0) {
    event.preventDefault();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <App />
);