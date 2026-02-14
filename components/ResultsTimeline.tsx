import React, { useState, useMemo } from 'react';
import { ActionItem } from '../types';

interface ResultsTimelineProps {
  actions: ActionItem[];
}

export const ResultsTimeline: React.FC<ResultsTimelineProps> = ({ actions }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredActions = useMemo(() => {
    return actions.filter(a => {
      const matchesType = filterType === 'all' || a.action_type === filterType;
      const matchesSearch = 
        a.detail.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.target.element.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [actions, filterType, searchTerm]);

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'click': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'type': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'keyboard_shortcut': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'ui_response': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'chunk_boundary': return 'bg-gray-700 text-gray-300 w-full text-center py-1 my-2 border-y border-gray-600';
      default: return 'bg-gray-700/30 text-gray-400 border-gray-600';
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    downloadFile(JSON.stringify(actions, null, 2), "tutorial_log.json", "application/json");
  };

  const downloadCSV = () => {
    const headers = ['Timestamp', 'Action Type', 'Actor', 'Element', 'Detail', 'Result', 'Confidence'];
    const rows = actions.map(a => [
      a.timestamp,
      a.action_type,
      a.actor,
      `"${(a.target?.element || '').replace(/"/g, '""')}"`,
      `"${(a.detail || '').replace(/"/g, '""')}"`,
      `"${(a.result || '').replace(/"/g, '""')}"`,
      a.confidence
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile(csvContent, "tutorial_log.csv", "text/csv");
  };

  const downloadMarkdown = () => {
    let md = `# Tutorial Analysis Log\n\n`;
    md += `| Timestamp | Type | Detail | Element | Result |\n`;
    md += `|-----------|------|--------|---------|--------|\n`;
    actions.forEach(a => {
        if (a.action_type === 'chunk_boundary') {
            md += `\n**--- ${a.detail} ---**\n\n`;
        } else {
            md += `| ${a.timestamp} | ${a.action_type} | ${a.detail} | ${a.target?.element || '-'} | ${a.result || '-'} |\n`;
        }
    });
    downloadFile(md, "tutorial_log.md", "text/markdown");
  };

  return (
    <div className="bg-gray-850 h-full flex flex-col rounded-xl border border-gray-750 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-750 flex flex-col md:flex-row justify-between items-center bg-gray-900/50 gap-3">
        <h2 className="text-lg font-semibold text-white">Extracted Events ({actions.length})</h2>
        <div className="flex gap-2">
           <button onClick={downloadJSON} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-white transition font-mono">
             JSON
           </button>
           <button onClick={downloadCSV} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-white transition font-mono">
             CSV
           </button>
           <button onClick={downloadMarkdown} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-white transition font-mono">
             MD
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-750 flex gap-4 bg-gray-900/30">
        <select 
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded px-3 py-1 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Types</option>
          <option value="click">Click</option>
          <option value="type">Type</option>
          <option value="ui_response">UI Response</option>
          <option value="keyboard_shortcut">Shortcut</option>
        </select>
        <input 
          type="text" 
          placeholder="Search details..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-sm text-white rounded px-3 py-1 flex-1 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredActions.length === 0 && (
          <div className="text-center text-gray-500 mt-10">No events found. Start analysis or adjust filters.</div>
        )}
        
        {filteredActions.map((action, idx) => {
          if (action.action_type === 'chunk_boundary') {
            return (
              <div key={idx} className="text-xs font-mono text-center text-gray-500 py-2 border-t border-b border-gray-800 bg-gray-900/50">
                --- {action.detail} ---
              </div>
            );
          }

          return (
            <div key={idx} className="flex gap-4 p-3 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 border border-gray-800 hover:border-gray-700 transition group">
              {/* Timestamp */}
              <div className="w-16 shrink-0 font-mono text-blue-400 font-bold text-sm pt-1">
                {action.timestamp}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getTypeColor(action.action_type)}`}>
                    {action.action_type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">{action.target?.element}</span>
                </div>
                
                <p className="text-gray-200 text-sm leading-relaxed">
                  {action.detail}
                </p>

                {action.result && (
                   <p className="text-gray-500 text-xs mt-1 pl-2 border-l-2 border-gray-700">
                     → {action.result}
                   </p>
                )}
                
                {/* Hover Details */}
                <div className="hidden group-hover:flex mt-2 gap-4 text-[10px] text-gray-600">
                    {action.actor !== 'user' && <span>Actor: {action.actor}</span>}
                    {action.target?.location && <span>Loc: {action.target.location}</span>}
                    <span>Confidence: {action.confidence}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};