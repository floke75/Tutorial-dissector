import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { AnalysisView } from './components/AnalysisView';

function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  return (
    <div className="h-full bg-gray-900 text-gray-100 font-sans overflow-hidden">
      {!activeProjectId ? (
        <div className="h-full overflow-y-auto">
          <Dashboard onOpenProject={setActiveProjectId} />
        </div>
      ) : (
        <div className="h-full p-6 max-w-7xl mx-auto flex flex-col">
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