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
  | 'chunk_boundary'; // Added for internal use

export interface ActionItem {
  timestamp: string;
  action_type: ActionType;
  actor: 'user' | 'system' | 'narrator';
  target: ActionTarget;
  detail: string;
  result: string | null;
  context_note: string | null;
  confidence: 'high' | 'medium' | 'low';
  // Internal tracking
  chunkIndex?: number;
}

export interface ChunkWindow {
  index: number;
  clipStart: number;
  clipEnd: number;
  primaryStart: number;
  primaryEnd: number;
  status: 'pending' | 'analyzing_phase_a' | 'analyzing_phase_b' | 'completed' | 'error';
  errorMsg?: string;
  actionCount?: number;
}

export interface ProcessingState {
  status: 'idle' | 'running' | 'paused' | 'completed';
  currentChunkIndex: number;
  totalActions: number;
  totalTokens: number;
  startTime: number | null;
  lastInteractionId: string | null;
}

export interface PhaseAResponse {
  actions: ActionItem[];
}

export interface PhaseBResponse {
  chunk_processed: { 
    number: number; 
    primary_window: string 
  };
  new_actions_added: number;
  duplicates_removed: number;
  conflicts_resolved: string[];
  current_ui_state: {
    application: string;
    active_file: string | null;
    visible_panels: string[];
    active_tool: string | null;
    open_dialogs: string[];
    other_state: string;
  };
  cumulative_action_count: number;
  validated_segment_events: ActionItem[]; 
}

// --- New Types for Project Management ---

export interface ProjectSummary {
  id: string;
  name: string;
  videoUrl: string;
  updatedAt: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  actionCount: number;
}

export interface ProjectData extends ProjectSummary {
  durationInput: string;
  chunkSize: number;
  overlap: number;
  chunks: ChunkWindow[];
  actions: ActionItem[];
  procState: ProcessingState;
  latestUIState: PhaseBResponse['current_ui_state'] | null;
}