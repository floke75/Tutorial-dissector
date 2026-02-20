
import React, { useState, useEffect, useRef } from 'react';
import { LogMessage } from '../types';

interface DevConsoleProps {
  logs: LogMessage[];
  onClear: () => void;
}

export const DevConsole: React.FC<DevConsoleProps> = ({ logs, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const getLevelStyles = (level: string) => {
    switch(level) {
      case 'error': return 'text-red-400 bg-red-900/10 border-red-900/30';
      case 'warn': return 'text-yellow-400 bg-yellow-900/10 border-yellow-900/30';
      case 'success': return 'text-emerald-400 bg-emerald-900/10 border-emerald-900/30';
      default: return 'text-blue-300 bg-blue-900/5 border-transparent';
    }
  };

  const getLevelBadge = (level: string) => {
    switch(level) {
      case 'error': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'warn': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'success': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default: return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out border-t border-gray-700 bg-gray-950/95 backdrop-blur-md flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] ${isOpen ? 'h-80' : 'h-10'}`}>
      
      {/* Header / Toggle Bar */}
      <div 
        className="h-10 px-4 flex justify-between items-center cursor-pointer hover:bg-gray-800/50 transition-colors shrink-0 select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          <span className="font-mono text-sm font-bold text-gray-300 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M4 17h16a2 2 0 002-2V9a2 2 0 00-2-2H4a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
            System Console
          </span>
          {!isOpen && logs.length > 0 && (
            <span className="ml-2 text-[10px] bg-gray-800 px-2 py-0.5 rounded-full text-gray-400 font-mono">
              {logs.length} events
            </span>
          )}
        </div>
        
        {isOpen && (
          <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={onClear}
              className="text-xs font-mono text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition"
            >
              Clear Logs
            </button>
          </div>
        )}
      </div>

      {/* Log View Area */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-[11px] leading-relaxed custom-scrollbar">
          {logs.length === 0 ? (
            <div className="text-gray-600 text-center mt-10 italic">No system logs yet. Start an analysis.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`flex flex-col md:flex-row gap-2 p-1.5 rounded border ${getLevelStyles(log.level)}`}>
                <div className="flex gap-2 shrink-0 md:w-48">
                  <span className="text-gray-500 opacity-70">[{formatTimestamp(log.timestamp)}]</span>
                  <span className={`px-1 rounded border uppercase font-bold text-[9px] ${getLevelBadge(log.level)}`}>
                    {log.level}
                  </span>
                </div>
                <div className="flex-1 min-w-0 break-words">
                  <span className="font-semibold">{log.message}</span>
                  {log.data && (
                    <pre className="mt-1 p-2 bg-black/40 rounded border border-gray-800/50 text-gray-400 overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} className="h-2" />
        </div>
      )}
    </div>
  );
};
