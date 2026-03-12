import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ActionItem, NarrativeStep, VideoAnnotation } from '../types';
import { parseMMSS } from '../utils/timeUtils';
import { extractSkeleton, compactStringify, cleanFinalOutput } from '../utils/jsonOptimize';

import { Download, Code2, Search, Target, AlertTriangle } from 'lucide-react';

interface ResultsTimelineProps {
  actions: ActionItem[];
  annotations?: VideoAnnotation[];
  narrativeSteps: NarrativeStep[];
  currentTime?: number;
  onSeek?: (time: number) => void;
  learnedContext?: string;
  videoUrl?: string;
  duration?: string;
  cleanedOutput?: any;
}

type TimelineNode = 
  | { type: 'action'; action: ActionItem }
  | { type: 'annotation'; annotation: VideoAnnotation };

export const ResultsTimeline: React.FC<ResultsTimelineProps> = ({ actions, annotations = [], narrativeSteps, currentTime = 0, onSeek, learnedContext, videoUrl, duration, cleanedOutput }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  // Build the Flat Action Tree
  const timelineNodes = useMemo(() => {
    const nodes: TimelineNode[] = [];

    actions.forEach(action => {
      nodes.push({ type: 'action', action });
    });

    annotations.forEach(annotation => {
      nodes.push({ type: 'annotation', annotation });
    });

    nodes.sort((a, b) => {
      const timeA = a.type === 'action' ? parseMMSS(a.action.timestamp) : parseMMSS(a.annotation.timestamp);
      const timeB = b.type === 'action' ? parseMMSS(b.action.timestamp) : parseMMSS(b.annotation.timestamp);
      return timeA - timeB;
    });

    return nodes;
  }, [actions, annotations]);

  const filteredNodes = useMemo(() => {
    if (!searchTerm) return timelineNodes;
    const lowerTerm = searchTerm.toLowerCase();

    return timelineNodes.filter(node => {
      if (node.type === 'action') {
        return (node.action.detail || '').toLowerCase().includes(lowerTerm) || (node.action.target?.element || '').toLowerCase().includes(lowerTerm);
      } else {
        return (node.annotation.content || '').toLowerCase().includes(lowerTerm) || (node.annotation.annotation_type || '').toLowerCase().includes(lowerTerm);
      }
    });
  }, [timelineNodes, searchTerm]);

  const activeState = useMemo(() => {
    let activeActionId: string | null = null;
    let activeAnnotationId: string | null = null;
    
    if (currentTime === 0) return { activeActionId, activeAnnotationId };

    let latestTime = -1;

    for (const node of filteredNodes) {
      const time = node.type === 'action' ? parseMMSS(node.action.timestamp) : parseMMSS(node.annotation.timestamp);
      if (time <= currentTime && time >= latestTime) {
        if (node.type === 'action') {
          activeActionId = node.action.id || null;
          activeAnnotationId = null;
        } else {
          activeAnnotationId = node.annotation.id || null;
          activeActionId = null;
        }
        latestTime = time;
      }
    }

    return { activeActionId, activeAnnotationId };
  }, [filteredNodes, currentTime]);

  // Auto-scroll to bottom on new items
  useEffect(() => {
    if (bottomRef.current && currentTime === 0) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [actions.length, currentTime]);

  // Auto-scroll to active node during playback
  useEffect(() => {
    if (activeNodeRef.current && currentTime > 0) {
      activeNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeState.activeActionId, activeState.activeAnnotationId]);

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'click': return 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-500/30';
      case 'type': return 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30';
      case 'keyboard_shortcut': return 'bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/30';
      case 'ui_response': return 'bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-500/30';
      default: return 'bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600';
    }
  };

  const downloadJSON = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      metadata: {
         total_steps: narrativeSteps.length,
         total_actions: actions.length,
         total_annotations: annotations.length,
         learned_context: learnedContext || ""
      },
      narrative_steps: narrativeSteps,
      visual_actions: actions,
      video_annotations: annotations
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "tutorial_workflow_graph.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCleanedOutput = () => {
    if (cleanedOutput) return cleanedOutput;
    const { result } = cleanFinalOutput({
      actions,
      annotations: annotations || [],
      narrativeSteps,
      learnedContext,
      metadata: {
        videoUrl,
        duration,
        total_actions: actions.length,
        total_steps: narrativeSteps.length,
        total_annotations: annotations?.length || 0,
        deduplicated: true // Assume true if generated on client
      }
    });
    return result;
  };

  const downloadCleanedJSON = () => {
    const output = getCleanedOutput();
    if (!output) return;
    const blob = new Blob([compactStringify(output)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "tutorial_workflow_cleaned.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSkeletonJSON = () => {
    const output = getCleanedOutput();
    if (!output) return;
    const skeleton = extractSkeleton(output);
    const blob = new Blob([compactStringify(skeleton)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "tutorial_workflow_skeleton.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPlaywright = () => {
    let script = `import { test, expect } from '@playwright/test';\n\n`;
    script += `test('Autogenerated Tutorial Workflow', async ({ page }) => {\n`;
    script += `  // Viewport assumed to be 1000x1000 to match normalized coordinate extraction.\n`;
    script += `  await page.setViewportSize({ width: 1000, height: 1000 });\n\n`;

    const actionMap = new Map<string, ActionItem>();
    actions.forEach(a => { if (a.id) actionMap.set(a.id, a); });

    narrativeSteps.forEach((step, idx) => {
      // Escape single quotes for JS string
      const intentName = step.intent.replace(/'/g, "\\'");
      script += `  await test.step('${idx + 1}. ${intentName}', async () => {\n`;
      if (step.precondition) script += `    // Precondition: ${step.precondition}\n`;
      
      const linkedActions = (step.linked_visual_action_ids || [])
          .map(id => actionMap.get(id))
          // CRITICAL: Filter out error recovery steps. Bots shouldn't make mistakes!
          .filter((a): a is ActionItem => !!a && !a.is_error_recovery);

      linkedActions.forEach(action => {
          script += `    // ${action.detail}\n`;
          
          if (action.action_type === 'click' && action.target?.spatial_bounding_box) {
              const [ymin, xmin, ymax, xmax] = action.target.spatial_bounding_box;
              const cy = (ymin + ymax) / 2;
              const cx = (xmin + xmax) / 2;
              // Coordinates are 0-1000 normalized, so we can use them directly on a 1000x1000 viewport
              script += `    await page.mouse.click(${Math.round(cx)}, ${Math.round(cy)}); // Target: ${action.target.element}\n`;
          } else if (action.action_type === 'type' && action.input_data?.text_typed) {
              const text = action.input_data.text_typed.replace(/'/g, "\\'");
              script += `    await page.keyboard.type('${text}');\n`;
          } else if (action.action_type === 'keyboard_shortcut' && action.input_data?.keys_pressed) {
              const combo = action.input_data.keys_pressed.join('+');
              script += `    await page.keyboard.press('${combo}');\n`;
          } else {
              script += `    // Action: ${action.action_type} on ${action.target?.element || 'unknown'}\n`;
          }
      });

      if (step.postcondition) script += `    // Postcondition: ${step.postcondition}\n`;
      script += `  });\n\n`;
    });

    script += `});\n`;

    const blob = new Blob([script], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "tutorial_workflow.spec.ts";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Renderer for a single low-level ActionItem
  const renderAction = (action: ActionItem, isActive: boolean = false, ref?: React.Ref<HTMLDivElement>, idx?: number) => {
    const isError = action.is_error_recovery;
    const baseStyle = 'hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:border-gray-300 dark:hover:border-gray-700';
    const bgStyle = isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-500/50 shadow-md ring-1 ring-indigo-500/50' : isError ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30 hover:border-orange-300 dark:hover:border-orange-800/50' : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-800';
    const textStyle = isError ? 'text-orange-800/70 dark:text-orange-200/70' : 'text-gray-700 dark:text-gray-300';
    
    return (
      <div 
        key={action.id || `${action.timestamp}-${action.action_type}-${idx}`} 
        ref={ref}
        className={`flex gap-4 p-3.5 rounded-xl border transition-all group relative cursor-pointer ${baseStyle} ${bgStyle}`}
        onClick={(e) => {
          e.stopPropagation();
          onSeek && onSeek(parseMMSS(action.timestamp));
        }}
      >
        
        {/* Error Recovery Indicator Line */}
        {isError && (
           <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 dark:bg-orange-600/50 rounded-l-xl"></div>
        )}

        <div className={`w-12 shrink-0 font-mono text-xs pt-1 font-medium ${isError ? 'text-orange-500/70 dark:text-orange-500/50' : 'text-gray-500 dark:text-gray-500'}`}>
          {action.timestamp}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${isError ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700/50' : getTypeColor(action.action_type || 'action')}`}>
              {(action.action_type || 'action').replace('_', ' ')}
            </span>
            <span className={`text-xs font-mono font-medium ${isError ? 'text-orange-400/80 dark:text-orange-300/60 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
              {action.target?.element}
            </span>
            
            {/* Spatial Bounding Box Badge */}
            {action.target?.spatial_bounding_box && action.target.spatial_bounding_box.length === 4 && !isError && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-blue-600 dark:text-blue-400/70 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/50 cursor-help" title="[ymin, xmin, ymax, xmax] normalized 0-1000">
                <Target size={12} />
                [{action.target.spatial_bounding_box.join(', ')}]
              </span>
            )}

            {isError && (
              <span className="text-[10px] font-bold uppercase text-orange-600 dark:text-orange-500 flex items-center gap-1 ml-auto border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-transparent px-2 py-0.5 rounded-md">
                <AlertTriangle size={12} />
                Correction (Skipped in Automation)
              </span>
            )}
          </div>
          
          <p className={`text-sm leading-relaxed mb-2.5 ${textStyle}`}>
            {action.detail}
          </p>

          {/* Result and Context Note */}
          {(action.result || action.context_note) && !isError && (
            <div className="flex flex-col gap-1.5 mb-2.5 text-xs">
              {action.result && (
                <div className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <span className="font-bold uppercase text-[9px] tracking-wider mt-0.5 opacity-70">Result:</span>
                  <span>{action.result}</span>
                </div>
              )}
              {action.context_note && (
                <div className="flex items-start gap-1.5 text-gray-500 dark:text-gray-400 italic">
                  <span className="font-bold uppercase text-[9px] tracking-wider mt-0.5 opacity-70 not-italic">Note:</span>
                  <span>{action.context_note}</span>
                </div>
              )}
            </div>
          )}

          {/* Strict Input Modeling (Keys & Text) */}
          {action.input_data && ((action.input_data.keys_pressed && action.input_data.keys_pressed.length > 0) || action.input_data.text_typed) && !isError && (
            <div className="flex flex-wrap items-center gap-3 mt-2 mb-2 p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-750">
               {action.input_data.keys_pressed && action.input_data.keys_pressed.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500 dark:text-gray-500 uppercase font-bold mr-1">Keys:</span>
                    {action.input_data.keys_pressed.map((k, i) => (
                      <React.Fragment key={i}>
                        <kbd className="px-2 py-0.5 text-xs font-mono font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-sm">{k}</kbd>
                        {i < action.input_data!.keys_pressed!.length - 1 && <span className="text-gray-400 dark:text-gray-600 font-medium">+</span>}
                      </React.Fragment>
                    ))}
                  </div>
               )}
               {action.input_data.text_typed && (
                 <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 dark:text-gray-500 uppercase font-bold">Typed:</span>
                    <span className="font-mono text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-900/50">
                      "{action.input_data.text_typed}"
                    </span>
                 </div>
               )}
            </div>
          )}

          {/* Rich UI Components with state mutations */}
          {action.interacted_components && action.interacted_components.length > 0 && !isError && (
            <div className="flex flex-wrap gap-2 mt-2.5">
              {action.interacted_components.map((comp, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 text-xs rounded-md border border-gray-200 dark:border-gray-700">
                  <span className="opacity-60 dark:opacity-50 uppercase text-[9px] font-bold tracking-wider">{comp.type}</span>
                  <span className="font-semibold text-blue-700 dark:text-blue-200">{comp.label}</span>
                  {(comp.state_before || comp.state_after || comp.action_value) && (
                     <span className="flex items-center gap-1.5 ml-1 pl-2 border-l border-gray-300 dark:border-gray-600">
                       {comp.state_before && <span className="text-gray-500 dark:text-gray-500 line-through text-[10px]">{comp.state_before}</span>}
                       {comp.state_after && <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-medium">→ {comp.state_after}</span>}
                       {comp.action_value && <span className="text-amber-600 dark:text-yellow-200 text-[10px] font-mono font-medium">="{comp.action_value}"</span>}
                     </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {action.ui_context && !isError && (
             <div className="flex flex-wrap gap-4 mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700/50 text-[10px] text-gray-500 dark:text-gray-500 font-mono font-medium">
               <span>Panel: {action.ui_context.active_panel}</span>
               <span>Tool: {action.ui_context.active_tool}</span>
               {action.ui_context.open_dialogs?.length > 0 && <span>Dialogs: {action.ui_context.open_dialogs.join(', ')}</span>}
             </div>
          )}
        </div>
      </div>
    );
  };

  // Renderer for a VideoAnnotation
  const renderAnnotation = (annotation: VideoAnnotation, isActive: boolean = false, ref?: React.Ref<HTMLDivElement>, idx?: number) => {
    const baseStyle = 'hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:border-gray-300 dark:hover:border-gray-700';
    const bgStyle = isActive ? 'bg-purple-50 dark:bg-purple-900/30 border-purple-300 dark:border-purple-500/50 shadow-md ring-1 ring-purple-500/50' : 'bg-gray-50 dark:bg-gray-800/20 border-gray-200 dark:border-gray-800 border-dashed';
    const textStyle = 'text-gray-700 dark:text-gray-300';
    
    return (
      <div 
        key={annotation.id || `ann-${annotation.timestamp}-${idx}`} 
        ref={ref}
        className={`flex gap-4 p-3.5 rounded-xl border transition-all group relative cursor-pointer ${baseStyle} ${bgStyle}`}
        onClick={(e) => {
          e.stopPropagation();
          onSeek && onSeek(parseMMSS(annotation.timestamp));
        }}
      >
        <div className="w-12 shrink-0 font-mono text-xs pt-1 font-medium text-purple-500/70 dark:text-purple-400/70">
          {annotation.timestamp}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700/50">
              {(annotation.annotation_type || 'annotation').replace('_', ' ')}
            </span>
          </div>
          
          <p className={`text-sm leading-relaxed mb-1 font-medium ${textStyle}`}>
            {annotation.content}
          </p>

          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            {annotation.relevance}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/50 dark:bg-gray-850/50 bg-gradient-to-br from-indigo-500/10 via-transparent to-sky-400/10 dark:from-indigo-500/10 dark:via-transparent dark:to-sky-400/10 backdrop-blur-md h-full flex flex-col rounded-2xl border border-gray-200/50 dark:border-gray-750/50 shadow-xl dark:shadow-black/40 overflow-hidden">
      {/* Header & Filters */}
      <div className="p-3 border-b border-gray-200/50 dark:border-gray-750/50 flex flex-col md:flex-row justify-between items-center bg-gray-50/50 dark:bg-gray-900/30 gap-3">
        <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight whitespace-nowrap">Execution Graph</h2>
        
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input 
            type="text" 
            placeholder="Search actions or elements..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-900 dark:text-white rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="flex gap-2">
           <button onClick={downloadPlaywright} className="text-[11px] bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700/60 px-3 py-1.5 rounded-lg text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all font-medium flex items-center gap-1.5 shadow-sm hover:shadow active:scale-[0.98] backdrop-blur-md">
             <Code2 size={13} />
             Playwright
           </button>
           <div 
             className="relative"
             onBlur={(e) => {
               if (!e.currentTarget.contains(e.relatedTarget)) {
                 setIsExportDropdownOpen(false);
               }
             }}
           >
             <button 
               onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
               className="text-[11px] bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700/60 px-3 py-1.5 rounded-lg text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-medium flex items-center gap-1.5 shadow-sm hover:shadow active:scale-[0.98] backdrop-blur-md"
             >
               <Download size={13} />
               Export JSON
             </button>
             {isExportDropdownOpen && (
               <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg transition-all z-50 overflow-hidden">
                 <button onClick={() => { downloadJSON(); setIsExportDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Export Raw</button>
                 <button onClick={() => { downloadCleanedJSON(); setIsExportDropdownOpen(false); }} disabled={actions.length === 0 && narrativeSteps.length === 0} className="w-full text-left px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">Export Cleaned</button>
                 <button onClick={() => { downloadSkeletonJSON(); setIsExportDropdownOpen(false); }} disabled={actions.length === 0 && narrativeSteps.length === 0} className="w-full text-left px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">Export Skeleton</button>
               </div>
             )}
           </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar bg-transparent">
        {filteredNodes.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-500 mt-12 font-medium">No events found in workflow graph.</div>
        )}
        
        {filteredNodes.map((node, idx) => {
          if (node.type === 'action') {
            const isActive = node.action.id === activeState.activeActionId;
            return renderAction(node.action, isActive, isActive ? activeNodeRef : undefined, idx);
          } else {
            const isActive = node.annotation.id === activeState.activeAnnotationId;
            return renderAnnotation(node.annotation, isActive, isActive ? activeNodeRef : undefined, idx);
          }
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
