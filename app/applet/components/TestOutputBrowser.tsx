import React, { useState, useEffect } from 'react';

export function TestOutputBrowser() {
  const [files, setFiles] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/test-output-files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFiles();
    }
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg opacity-50 hover:opacity-100 z-50 text-sm font-mono"
      >
        View Server Logs
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white border border-gray-200 shadow-xl rounded-lg z-50 flex flex-col max-h-[80vh]">
      <div className="flex justify-between items-center p-3 border-b bg-gray-50 rounded-t-lg">
        <h3 className="font-semibold text-sm">Server test-output Logs</h3>
        <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
      </div>
      <div className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 50px)' }}>
        {files.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No files found.</p>
        ) : (
          <ul className="space-y-1">
            {files.map(f => (
              <li key={f}>
                <a 
                  href={`/test-output/${f}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline font-mono truncate block"
                >
                  {f}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-center">
        <button onClick={fetchFiles} className="hover:text-gray-600">Refresh List</button>
      </div>
    </div>
  );
}
