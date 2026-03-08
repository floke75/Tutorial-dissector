

export type AnnotationType = 
  | 'title_card'
  | 'lower_third'
  | 'text_overlay'
  | 'gui_highlight'
  | 'zoom_in'
  | 'transition'
  | 'illustration'
  | 'bullet_points'
  | string;

export interface VideoAnnotation {
  id: string;                  // e.g., ann_a1b2c3d4
  timestamp: string;           // When it appears
  annotation_type: AnnotationType;
  content: string;             // The text shown, or description of the highlight/illustration
  relevance: string;           // Why this matters to the workflow
  chunkIndex?: number;
}

export interface ActionTarget {
  element: string;
  location: string;
  panel: string;
  visual: string;
  spatial_bounding_box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
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
  | 'transition';

export type ActionConfidence = 'high' | 'medium' | 'low';
export type ActorType = 'user' | 'system';
export type ChunkStatus = 'pending' | 'analyzing_phase_a' | 'analyzing_phase_b' | 'analyzing_phase_c' | 'completed' | 'error';
export type ProcessingStatus = 'idle' | 'running_visual' | 'paused' | 'completed' | 'error' | 'cancelled';
export type InsightType = 'explanation' | 'rationale' | 'tip' | 'warning' | 'workflow_framing' | 'comparison';

export type UIComponentType = 'button' | 'menu_item' | 'tab' | 'dropdown' | 'checkbox' | 'radio' | 'input_field' | 'toggle' | 'link' | 'modal' | 'panel' | 'other';

export interface UIComponent {
  type: UIComponentType | string;
  label: string;
  state_before?: string; // e.g., "unchecked", "hidden", "disabled"
  state_after?: string;  // e.g., "checked", "visible", "enabled"
  action_value?: string; // Value selected from a dropdown or toggle
}

export interface UIStateSnapshot {
  active_panel: string;
  active_tool: string;
  open_dialogs: string[];
}

export interface InputData {
  keys_pressed?: string[]; // e.g., ["Ctrl", "Shift", "P"]
  text_typed?: string;     // The exact string typed into an input
}

export interface ActionItem {
  id: string; // Unique identifier (e.g., evt_001)
  timestamp: string;
  action_type: ActionType;
  actor: ActorType;
  target: ActionTarget;
  detail: string;
  result: string | null;
  context_note: string | null;
  confidence: ActionConfidence;
  
  interacted_components?: UIComponent[];
  ui_context?: UIStateSnapshot; 
  input_data?: InputData;
  
  is_error_recovery?: boolean; // True if this action is the user correcting a mistake
  
  // Internal tracking
  chunkIndex?: number;
}

export interface NarrativeStep {
  id: string; 
  timestamp: string;
  intent: string; 
  precondition: string; // What must be true before this step (Given)
  explanation: string; 
  postcondition: string; // How to verify the step succeeded (Then)
  insight_type: InsightType;
  topics: string[];
  linked_visual_action_ids: string[]; 
  linked_annotation_ids?: string[];
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

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogMessage {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

export interface ProcessingState {
  status: ProcessingStatus;
  currentChunkIndex: number;
  totalActions: number;
  totalTokens: number;
  startTime: number | null;
  lastInteractionId: string | null; 
  chatHistory?: any[]; 
  logs?: LogMessage[]; // Added logs array for Dev Console
  jobId?: string;
  duration?: number;
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
  validated_segment_annotations?: VideoAnnotation[];
  merged_log_excerpt?: ActionItem[];
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
  customContext: string;
  
  chunks: Chunk[];
  actions: ActionItem[];
  annotations: VideoAnnotation[];
  narrativeSteps: NarrativeStep[];
  
  // Runtime State
  procState: ProcessingState;
  
  // Context State
  latestUIState: UIState | null;
}
