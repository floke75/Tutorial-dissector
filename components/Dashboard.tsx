import React, { useEffect, useState } from 'react';
import { ProjectSummary } from '../types';
import { getProjects, createProject, deleteProject } from '../services/storage';

interface DashboardProps {
  onOpenProject: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  const handleCreate = () => {
    const id = createProject();
    if (id) {
      onOpenProject(id);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this project?")) {
      deleteProject(id);
      setProjects(getProjects());
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'text-green-400 border-green-400/30 bg-green-900/20';
      case 'running': return 'text-blue-400 border-blue-400/30 bg-blue-900/20 animate-pulse';
      case 'paused': return 'text-yellow-400 border-yellow-400/30 bg-yellow-900/20';
      case 'error': return 'text-red-400 border-red-400/30 bg-red-900/20';
      default: return 'text-gray-400 border-gray-600 bg-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-gray-800 pb-8">
        <div>
          <h1 className="text-4xl font-bold text-blue-400 mb-2">Tutorial Dissector</h1>
          <p className="text-gray-400 max-w-2xl">
            Manage your Gemini 3 Pro video analysis projects. Resume previous sessions or start new extractions.
          </p>
        </div>
        <button 
          onClick={handleCreate}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/50 transition-all flex items-center gap-2"
        >
          <span className="text-xl">+</span> New Project
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-800 rounded-2xl bg-gray-900/50">
            <h3 className="text-xl text-gray-500 font-semibold">No projects yet</h3>
            <p className="text-gray-600 mt-2 mb-6">Create your first analysis project to get started.</p>
            <button 
              onClick={handleCreate}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition"
            >
              Create Project
            </button>
          </div>
        )}

        {projects.map(project => (
          <div 
            key={project.id}
            onClick={() => onOpenProject(project.id)}
            className="group bg-gray-850 hover:bg-gray-800 border border-gray-800 hover:border-blue-500/50 rounded-xl p-6 transition-all cursor-pointer relative shadow-lg hover:shadow-blue-900/20 flex flex-col h-64"
          >
            <div className="flex justify-between items-start mb-4">
              <span className={`px-2 py-0.5 text-xs font-mono font-bold uppercase rounded border ${getStatusColor(project.status)}`}>
                {project.status}
              </span>
              <button 
                onClick={(e) => handleDelete(e, project.id)}
                className="text-gray-600 hover:text-red-400 p-1 rounded hover:bg-gray-900 transition"
                title="Delete Project"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            <h3 className="text-xl font-bold text-gray-100 mb-2 truncate group-hover:text-blue-400 transition">
              {project.name}
            </h3>
            
            <p className="text-sm text-gray-500 mb-6 truncate font-mono">
              {project.videoUrl || 'No video URL set'}
            </p>

            <div className="mt-auto grid grid-cols-2 gap-4 text-sm border-t border-gray-800 pt-4">
              <div>
                <p className="text-gray-600 text-xs uppercase tracking-wider mb-1">Actions</p>
                <p className="font-mono text-gray-300">{project.actionCount}</p>
              </div>
              <div>
                <p className="text-gray-600 text-xs uppercase tracking-wider mb-1">Last Updated</p>
                <p className="font-mono text-gray-300">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};