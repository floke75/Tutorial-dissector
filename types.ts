
export interface ActionTarget {
  element: string;
  location: string;
  panel: string;
  visual: string;
}

export type ActionType = 
  | 'click' 
  | 'double_click' 
  | 'right_click' 
  | 'drag' 
  | 'scroll' 
  | 'type' 
  | 'keyboard_shortcut' 
  | 'hover' 
  | 'select' 
  | 'menu_navigate' 
  | 'system_event' 
  | 'ui_response' 
  | 'transition' 
  | 'narration_cue'
  | 'chunk_boundary'
  | 'narration';

export type ActionConfidence = 'high' | 'medium' | 'low';
export type ActorType = 'user' | 'system' | 'narrator';
export type ChunkStatus = 'pending' | 'analyzing_phase_a' | 'analyzing_phase_b' | 'completed' | 'error';
export type ProcessingStatus = 'idle' | 'running_visual' | 'running_narration' | 'paused' | 'completed' | 'error';
export type InsightType = 'explanation' | 'rationale' | 'tip' | 'warning' | 'workflow_framing' | 'comparison';

export interface ActionItem {
  timestamp: string;
  action_type: ActionType;
  actor: ActorType;
  target: ActionTarget;
  detail: string;
  result: string | null;
  context_note: string | null;
  confidence: ActionConfidence;
  // Internal tracking
  chunkIndex?: number;
  
  // Pass 2 (Narration) specific optional fields
  text?: string;
  topics?: string[];
  insight_type?: InsightType;
  relates_to?: string | null;
}

export interface Chunk {
  index: number;
  
  // Time windows
  clipStart: number;
  clipEnd: number;
  primaryStart: number;
  primaryEnd: number;
  
  status: ChunkStatus;
  errorMsg?: string;
  
  // Analysis Artifacts
  phaseARawCount?: number;
  phaseBAddedCount?: number;
  interactionId?: string;
  actionCount?: number;
}

export interface ProcessingState {
  status: ProcessingStatus;
  currentChunkIndex: number;
  narrationStartTime: number; // Track progress of narration pass (in seconds)
  totalActions: number;
  totalTokens: number;
  startTime: number | null;
  lastInteractionId: string | null;
}

export interface PhaseAResponse {
  actions: ActionItem[];
}

export interface UIState {
  application: string;
  active_file: string | null;
  visible_panels: string[];
  active_tool: string | null;
  open_dialogs: string[];
  other_state: string;
}

export interface PhaseBResponse {
  chunk_processed: { 
    number: number; 
    primary_window: string 
  };
  new_actions_added: number;
  duplicates_removed: number;
  conflicts_resolved: string[];
  current_ui_state: UIState;
  cumulative_action_count: number;
  validated_segment_events: ActionItem[]; 
}

export interface VideoMetadata {
    url: string;
    title?: string;
    duration?: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  videoUrl: string;
  updatedAt: number;
  status: ProcessingStatus;
  actionCount: number;
}

export interface Project extends ProjectSummary {
  durationInput: string;
  chunkSize: number;
  overlap: number;
  
  chunks: Chunk[];
  actions: ActionItem[];
  
  // Runtime State
  procState: ProcessingState;
  
  // Context State
  latestUIState: UIState | null;
}
