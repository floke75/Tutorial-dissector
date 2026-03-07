import React, { useEffect, useState } from 'react';
import { ProjectSummary } from '../types';
import { getProjects, createProject, deleteProject } from '../services/storage';
import { ThemeToggle } from './ThemeToggle';
import { Trash2, Plus, Play, Pause, CheckCircle2, AlertCircle } from 'lucide-react';

interface DashboardProps {
  onOpenProject: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    getProjects().then(setProjects);
  }, []);

  const handleCreate = async () => {
    const id = await createProject();
    if (id) {
      onOpenProject(id);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      await deleteProject(id);
      setProjects(await getProjects());
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const getStatusConfig = (status: string) => {
    switch(status) {
      case 'completed': return { color: 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-900/20', icon: <CheckCircle2 size={14} /> };
      case 'running_visual':
      case 'running_narration': return { color: 'text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-400/30 bg-blue-50 dark:bg-blue-900/20 animate-pulse', icon: <Play size={14} /> };
      case 'paused': return { color: 'text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-900/20', icon: <Pause size={14} /> };
      case 'error': return { color: 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-400/30 bg-red-50 dark:bg-red-900/20', icon: <AlertCircle size={14} /> };
      default: return { color: 'text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800', icon: null };
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-gray-200 dark:border-gray-800 pb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">Tutorial Dissector</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl text-lg leading-relaxed">
            Manage your Gemini 3.1 Pro Preview video analysis projects. Resume previous sessions or start new extractions.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button 
            onClick={handleCreate}
            className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-medium rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 active:scale-[0.98]"
          >
            <Plus size={18} /> New Project
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {projects.length === 0 && (
          <div className="col-span-full py-24 text-center border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-2xl bg-gray-50 dark:bg-gray-900/50">
            <h3 className="text-xl text-gray-700 dark:text-gray-300 font-medium">No projects yet</h3>
            <p className="text-gray-500 dark:text-gray-500 mt-2 mb-8">Create your first analysis project to get started.</p>
            <button 
              onClick={handleCreate}
              className="px-6 py-2.5 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm hover:shadow-md transition-all active:scale-[0.98] backdrop-blur-sm"
            >
              Create Project
            </button>
          </div>
        )}

        {projects.map(project => {
          const statusConfig = getStatusConfig(project.status);
          return (
            <div 
              key={project.id}
              onClick={() => onOpenProject(project.id)}
              className="group bg-white/70 dark:bg-gray-850/70 backdrop-blur-md hover:bg-white/90 dark:hover:bg-gray-800/90 border border-gray-200/50 dark:border-gray-800/50 hover:border-blue-300 dark:hover:border-blue-500/50 rounded-2xl p-6 transition-all cursor-pointer relative shadow-md hover:shadow-xl hover:-translate-y-1 dark:shadow-black/20 dark:hover:shadow-black/40 flex flex-col h-64"
            >
              <div className="flex justify-between items-start mb-5">
                <span className={`px-2.5 py-1 text-xs font-mono font-medium uppercase rounded-md border flex items-center gap-1.5 ${statusConfig.color}`}>
                  {statusConfig.icon}
                  {project.status.replace('running_', '').replace('_', ' ')}
                </span>
                <button 
                  onClick={(e) => handleDelete(e, project.id)}
                  className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                    confirmDeleteId === project.id 
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60' 
                      : 'text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-900'
                  }`}
                  title={confirmDeleteId === project.id ? "Click again to confirm" : "Delete Project"}
                >
                  {confirmDeleteId === project.id ? (
                    <span className="text-xs font-medium px-1">Confirm</span>
                  ) : (
                    <Trash2 size={18} />
                  )}
                </button>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {project.name}
              </h3>
              
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-6 truncate font-mono bg-gray-100 dark:bg-gray-900/50 px-2 py-1 rounded w-fit max-w-full">
                {project.videoUrl || 'No video URL set'}
              </p>

              <div className="mt-auto grid grid-cols-2 gap-4 text-sm border-t border-gray-100 dark:border-gray-800 pt-5">
                <div>
                  <p className="text-gray-500 dark:text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Actions</p>
                  <p className="font-mono text-gray-900 dark:text-gray-300 font-medium">{project.actionCount}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Last Updated</p>
                  <p className="font-mono text-gray-900 dark:text-gray-300 font-medium">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};