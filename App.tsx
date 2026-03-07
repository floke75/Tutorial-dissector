import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { AnalysisView } from './components/AnalysisView';

function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    // Initialize theme based on localStorage or system preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div className="h-full bg-warm-flow text-gray-900 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-200">
      {!activeProjectId ? (
        <div className="h-full overflow-y-auto">
          <Dashboard onOpenProject={setActiveProjectId} />
        </div>
      ) : (
        <AnalysisView 
          projectId={activeProjectId} 
          onBack={() => setActiveProjectId(null)} 
        />
      )}
    </div>
  );
}

export default App;