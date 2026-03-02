
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ActionItem, NarrativeStep } from '../types';
import { parseMMSS } from '../utils/timeUtils';

import { Download, Code2, Search, Target, AlertTriangle } from 'lucide-react';

interface ResultsTimelineProps {
  actions: ActionItem[];
  narrativeSteps: NarrativeStep[];
  currentTime?: number;
  onSeek?: (time: number) => void;
}

type TimelineNode = 
  | { type: 'narrative'; step: NarrativeStep; children: ActionItem[] }
  | { type: 'orphan_action'; action: ActionItem }
  | { type: 'boundary'; detail: string; timestamp: string };

export const ResultsTimeline: React.FC<ResultsTimelineProps> = ({ actions, narrativeSteps, currentTime = 0, onSeek }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  // Build the Relational Tree
  const timelineNodes = useMemo(() => {
    const actionMap = new Map<string, ActionItem>();
    actions.forEach(a => { if (a.id) actionMap.set(a.id, a); });

    const linkedActionIds = new Set<string>();
    const nodes: TimelineNode[] = [];

    narrativeSteps.forEach(step => {
      const children: ActionItem[] = [];
      step.linked_visual_action_ids?.forEach(id => {
        const action = actionMap.get(id);
        if (action) {
          children.push(action);
          linkedActionIds.add(id);
        }
      });
      children.sort((a, b) => parseMMSS(a.timestamp) - parseMMSS(b.timestamp));
      nodes.push({ type: 'narrative', step, children });
    });

    actions.forEach(action => {
      if (action.action_type === 'chunk_boundary') {
        nodes.push({ type: 'boundary', detail: action.detail, timestamp: action.timestamp });
      } else if (!linkedActionIds.has(action.id)) {
        nodes.push({ type: 'orphan_action', action });
      }
    });

    nodes.sort((a, b) => {
      const timeA = parseMMSS(a.type === 'narrative' ? a.step.timestamp : a.type === 'orphan_action' ? a.action.timestamp : a.timestamp);
      const timeB = parseMMSS(b.type === 'narrative' ? b.step.timestamp : b.type === 'orphan_action' ? b.action.timestamp : b.timestamp);
      return timeA - timeB;
    });

    return nodes;
  }, [actions, narrativeSteps]);

  const filteredNodes = useMemo(() => {
    if (!searchTerm) return timelineNodes;
    const lowerTerm = searchTerm.toLowerCase();

    return timelineNodes.filter(node => {
      if (node.type === 'boundary') return false;
      if (node.type === 'orphan_action') {
        return node.action.detail.toLowerCase().includes(lowerTerm) || node.action.target?.element?.toLowerCase().includes(lowerTerm);
      }
      if (node.type === 'narrative') {
        const matchesStep = node.step.intent.toLowerCase().includes(lowerTerm) || node.step.explanation.toLowerCase().includes(lowerTerm);
        const matchesChild = node.children.some(c => c.detail.toLowerCase().includes(lowerTerm));
        return matchesStep || matchesChild;
      }
      return false;
    });
  }, [timelineNodes, searchTerm]);

  const activeNodeIndex = useMemo(() => {
    if (currentTime === 0) return -1;
    let activeIdx = -1;
    for (let i = 0; i < filteredNodes.length; i++) {
      const node = filteredNodes[i];
      if (node.type === 'boundary') continue;
      
      let time = 0;
      if (node.type === 'narrative') {
        time = parseMMSS(node.step.timestamp);
      } else if (node.type === 'orphan_action') {
        time = parseMMSS(node.action.timestamp);
      }

      if (time <= currentTime) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }, [filteredNodes, currentTime]);

  // Auto-scroll to bottom on new items
  useEffect(() => {
    if (bottomRef.current && currentTime === 0) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [actions.length, narrativeSteps.length, currentTime]);

  // Auto-scroll to active node during playback
  useEffect(() => {
    if (activeNodeRef.current && currentTime > 0) {
      activeNodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeNodeIndex]);

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'click': return 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-500/30';
      case 'type': return 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30';
      case 'keyboard_shortcut': return 'bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/30';
      case 'ui_response': return 'bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-500/30';
      default: return 'bg-gray-100 dark:bg-gray-700/30 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600';
    }
  };

  const getInsightColor = (insight?: string) => {
    switch(insight) {
      case 'warning': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-500/30';
      case 'tip': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-500/30';
      case 'rationale': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-500/30';
      default: return 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-500/30';
    }
  };

  const downloadJSON = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      metadata: {
         total_steps: narrativeSteps.length,
         total_actions: actions.length
      },
      narrative_steps: narrativeSteps,
      visual_actions: actions
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
  const renderAction = (action: ActionItem, isNested: boolean, isActive: boolean = false, ref?: React.Ref<HTMLDivElement>) => {
    const isError = action.is_error_recovery;
    const baseStyle = isNested ? 'ml-4 border-l-2 border-l-gray-300 dark:border-l-gray-600' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:border-gray-300 dark:hover:border-gray-700';
    const bgStyle = isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-500/50 shadow-md ring-1 ring-indigo-500/50' : isError ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30 hover:border-orange-300 dark:hover:border-orange-800/50' : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-800';
    const textStyle = isError ? 'text-orange-800/70 dark:text-orange-200/70' : 'text-gray-700 dark:text-gray-300';
    
    return (
      <div 
        key={action.id || action.timestamp + action.action_type} 
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
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${isError ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-700/50' : getTypeColor(action.action_type)}`}>
              {action.action_type.replace('_', ' ')}
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

          {/* Strict Input Modeling (Keys & Text) */}
          {action.input_data && (action.input_data.keys_pressed || action.input_data.text_typed) && !isError && (
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
             <div className="hidden group-hover:flex flex-wrap gap-4 mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700/50 text-[10px] text-gray-500 dark:text-gray-500 font-mono font-medium">
               <span>Panel: {action.ui_context.active_panel}</span>
               <span>Tool: {action.ui_context.active_tool}</span>
               {action.ui_context.open_dialogs?.length > 0 && <span>Dialogs: {action.ui_context.open_dialogs.join(', ')}</span>}
             </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/50 dark:bg-gray-850/50 bg-gradient-to-br from-indigo-500/10 via-transparent to-sky-400/10 dark:from-indigo-500/10 dark:via-transparent dark:to-sky-400/10 backdrop-blur-md h-full flex flex-col rounded-2xl border border-gray-200/50 dark:border-gray-750/50 shadow-xl dark:shadow-black/40 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-200/50 dark:border-gray-750/50 flex flex-col md:flex-row justify-between items-center bg-gray-50/50 dark:bg-gray-900/30 gap-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Hierarchical Execution Graph</h2>
        <div className="flex gap-3">
           <button onClick={downloadPlaywright} className="text-xs bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700/60 px-4 py-2 rounded-xl text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all font-medium flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98] backdrop-blur-md">
             <Code2 size={15} />
             Export Playwright
           </button>
           <button onClick={downloadJSON} className="text-xs bg-white/60 dark:bg-gray-800/60 hover:bg-white dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700/60 px-4 py-2 rounded-xl text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-medium flex items-center gap-2 shadow-sm hover:shadow active:scale-[0.98] backdrop-blur-md">
             <Download size={15} />
             Export JSON
           </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200/50 dark:border-gray-750/50 flex gap-4 bg-white/50 dark:bg-gray-900/20">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search intents, pre-conditions, actions, or elements..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-transparent">
        {filteredNodes.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-500 mt-12 font-medium">No events found in workflow graph.</div>
        )}
        
        {filteredNodes.map((node, idx) => {
          if (node.type === 'boundary') {
            return (
              <div key={`boundary-${idx}`} className="text-xs font-mono font-medium text-center text-gray-500 dark:text-gray-600 py-4 border-t border-b border-gray-200 dark:border-gray-800 bg-gray-100/50 dark:bg-gray-900/20 rounded-lg">
                --- {node.detail} ---
              </div>
            );
          }

          if (node.type === 'orphan_action') {
            const isActive = idx === activeNodeIndex;
            return renderAction(node.action, false, isActive, isActive ? activeNodeRef : undefined);
          }

          if (node.type === 'narrative') {
            const { step, children } = node;
            const isActive = idx === activeNodeIndex;
            return (
               <div 
                 key={step.id} 
                 ref={isActive ? activeNodeRef : null}
                 className={`rounded-2xl border overflow-hidden shadow-sm dark:shadow-lg mb-8 backdrop-blur-sm transition-all ${
                   isActive 
                     ? 'bg-indigo-50/80 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-500/50 ring-1 ring-indigo-500/50' 
                     : 'bg-white/80 dark:bg-gradient-to-b dark:from-indigo-900/10 dark:to-gray-800/20 border-gray-200/50 dark:border-indigo-900/40'
                 }`}
               >
                  {/* Narrative Header */}
                  <div 
                    className={`p-6 border-b border-gray-100/50 dark:border-indigo-900/30 relative cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-900/30 transition-colors ${
                      isActive ? 'bg-indigo-100/50 dark:bg-indigo-900/40' : 'bg-indigo-50/20 dark:bg-transparent'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek && onSeek(parseMMSS(step.timestamp));
                    }}
                  >
                     <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${isActive ? 'bg-indigo-600' : 'bg-indigo-500'}`}></div>
                     
                     <div className="flex gap-5">
                        <div className="w-12 shrink-0 font-mono text-indigo-600 dark:text-indigo-400 font-bold text-sm pt-1">
                          {step.timestamp}
                        </div>
                        <div className="flex-1">
                           <div className="flex items-center gap-3 mb-4">
                             <h3 className="text-xl font-bold text-gray-900 dark:text-indigo-100 tracking-tight">{step.intent}</h3>
                             {step.insight_type && (
                               <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${getInsightColor(step.insight_type)}`}>
                                 {step.insight_type}
                               </span>
                             )}
                           </div>
                           
                           {/* BDD Pre/Post Conditions */}
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                             {step.precondition && (
                               <div className="bg-white dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-750 shadow-sm dark:shadow-none">
                                 <div className="text-[10px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-blue-500"></div> Precondition (Given)
                                 </div>
                                 <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{step.precondition}</p>
                               </div>
                             )}
                             {step.postcondition && (
                               <div className="bg-white dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-750 shadow-sm dark:shadow-none">
                                 <div className="text-[10px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Postcondition (Then)
                                 </div>
                                 <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{step.postcondition}</p>
                               </div>
                             )}
                           </div>

                           <p className="text-gray-600 dark:text-gray-400 italic font-serif leading-relaxed mb-4 text-sm border-l-2 border-indigo-200 dark:border-indigo-900/50 pl-4 py-1">
                             "{step.explanation}"
                           </p>
                           
                           {step.topics && step.topics.length > 0 && (
                             <div className="flex flex-wrap gap-2 mt-3">
                               {step.topics.map((t, i) => (
                                 <span key={i} className="px-2 py-1 bg-indigo-50 dark:bg-gray-900/50 text-indigo-700 dark:text-indigo-300/70 text-[10px] font-medium rounded-md border border-indigo-100 dark:border-indigo-900/50">
                                   #{t}
                                 </span>
                               ))}
                             </div>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Nested Visual Actions */}
                  {children.length > 0 && (
                    <div className="p-5 bg-gray-50/80 dark:bg-gray-900/40 space-y-3">
                      <div className="text-[10px] font-bold text-indigo-400 dark:text-indigo-300/50 uppercase tracking-widest mb-4 ml-4 flex items-center gap-2">
                         <Code2 size={14} />
                         Execution Steps (When)
                      </div>
                      {children.map(action => renderAction(action, true))}
                    </div>
                  )}
               </div>
            );
          }

          return null;
        })}
        {/* Scroll anchor */}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
};
