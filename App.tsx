import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { AnalysisView } from './components/AnalysisView';

function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      {!activeProjectId ? (
        <Dashboard onOpenProject={setActiveProjectId} />
      ) : (
        <div className="p-6 max-w-7xl mx-auto">
          <AnalysisView 
            projectId={activeProjectId} 
            onBack={() => setActiveProjectId(null)} 
          />
        </div>
      )}
    </div>
  );
}

export default App;