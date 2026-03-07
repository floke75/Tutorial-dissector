
-- tutorial-dissector.allium
-- Scope: Domain logic for the Tutorial Dissector application
-- Includes: Projects, Chunks, Actions, Narrative Steps, Automation Pipeline
-- Excludes: UI rendering logic, generic storage implementation details

config {
    default_chunk_size: Duration = 5.minutes
    default_overlap: Duration = 60.seconds
    narration_chunk_size: Duration = 15.minutes
    narration_context_buffer: Duration = 15.seconds
    spatial_normalization_max: Integer = 1000
}

------------------------------------------------------------
-- Enumerations
------------------------------------------------------------

enum ProcessingStatus { idle | running_visual | running_narration | paused | completed | error }
enum ChunkStatus { pending | analyzing_phase_a | analyzing_phase_b | completed | error }
enum ActionConfidence { high | medium | low }
enum ActorType { user | system }
enum ActionType { 
    click | double_click | right_click | drag | scroll | 
    type | keyboard_shortcut | hover | select | menu_navigate | 
    system_event | ui_response | transition | chunk_boundary
}
enum InsightType { explanation | rationale | tip | warning | workflow_framing | comparison }

------------------------------------------------------------
-- Value Types
------------------------------------------------------------

value VideoMetadata {
    url: String
    title: String?
    duration: Duration
}

value ActionTarget {
    element: String
    location: String
    panel: String
    visual: String
    -- Normalized bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale
    spatial_bounding_box: List<Decimal>? 
}

value UIComponent {
    type: String
    label: String
    state_before: String?
    state_after: String?
    action_value: String?
}

value UIStateSnapshot {
    active_panel: String
    active_tool: String
    open_dialogs: List<String>
}

value InputData {
    keys_pressed: List<String>?
    text_typed: String?
}

------------------------------------------------------------
-- Entities
------------------------------------------------------------

entity Project {
    name: String
    video: VideoMetadata
    created_at: Timestamp
    updated_at: Timestamp
    status: ProcessingStatus
    
    -- Config for this run
    chunk_size: Duration
    overlap: Duration

    -- Relationships
    chunks: Chunk with project = this
    actions: ActionItem with project = this
    narrative_steps: NarrativeStep with project = this

    -- State tracking
    current_chunk_index: Integer
    narration_progress: Duration
    total_tokens_used: Integer
    
    -- Latest detected UI Context (from Phase B)
    latest_ui_state: UIStateSnapshot?
}

entity Chunk {
    project: Project
    index: Integer
    
    -- Time windows
    primary_start: Duration
    primary_end: Duration
    clip_start: Duration
    clip_end: Duration
    
    status: ChunkStatus
    error_msg: String?
    
    -- Analysis artifacts
    phase_a_raw_count: Integer?
    phase_b_added_count: Integer?
    interaction_id: String?
    action_count: Integer?
}

-- Low-level mechanical action
entity ActionItem {
    project: Project
    id: String                    -- Unique string (e.g. evt_001)
    chunk_index: Integer?
    
    timestamp: Duration
    action_type: ActionType
    actor: ActorType
    target: ActionTarget
    detail: String
    result: String?
    context_note: String?
    confidence: ActionConfidence

    -- Rich UI & State Data
    interacted_components: List<UIComponent>?
    ui_context: UIStateSnapshot?
    input_data: InputData?
    
    -- Pathing Flags
    is_error_recovery: Boolean
}

-- High-level BDD grouping
entity NarrativeStep {
    project: Project
    id: String
    
    timestamp: Duration
    intent: String
    precondition: String
    explanation: String
    postcondition: String
    insight_type: InsightType
    topics: List<String>
    
    -- Relational mapping to ActionItems
    linked_action_ids: Set<String>
}

------------------------------------------------------------
-- Rules
------------------------------------------------------------

rule StartAnalysis {
    when: UserStartsAnalysis(project)
    
    requires: project.status in { idle, paused, completed }
    requires: project.video.url != ""
    
    ensures: project.status = running_visual
    ensures: project.updated_at = now
}

-- Visual Loop
rule CompletePhaseA {
    when: PhaseACompleted(chunk, raw_actions)
    requires: chunk.status = analyzing_phase_a
    ensures: chunk.status = analyzing_phase_b
}

rule CompletePhaseB {
    when: PhaseBCompleted(chunk, merged_actions, ui_state)
    
    requires: chunk.status = analyzing_phase_b
    
    ensures: chunk.status = completed
    ensures: chunk.project.latest_ui_state = ui_state
    ensures: chunk.project.current_chunk_index = chunk.index + 1
    
    -- Add Action Items (Mechanical layer)
    ensures: 
        for action in merged_actions:
            ActionItem.created(
                project: chunk.project,
                id: action.id,
                chunk_index: chunk.index,
                timestamp: action.timestamp,
                action_type: action.type,
                actor: action.actor,
                target: action.target,
                input_data: action.input_data,
                interacted_components: action.components,
                ui_context: action.ui_context,
                is_error_recovery: action.is_error_recovery,
                detail: action.detail,
                confidence: action.confidence
            )
}

-- Transition
rule StartNarrationPhase {
    when: AllVisualChunksCompleted(project)
    requires: project.status = running_visual
    requires: project.chunks.all(c => c.status = completed)
    ensures: project.status = running_narration
}

-- Narration Loop
rule AnalyzeNarrationSegment {
    when: ProcessNextNarrationSegment(project, start_time, end_time)

    requires: project.status = running_narration

    let context_window_start = start_time - config.narration_context_buffer
    let context_window_end = end_time + config.narration_context_buffer
    
    let visual_context = project.actions where 
        timestamp >= context_window_start and timestamp <= context_window_end

    -- External AI Synthesis produces NarrativeSteps that link to ActionItems via ID
    ensures: project.narration_progress = end_time
}

rule CompleteProject {
    when: NarrationFinished(project)
    requires: project.status = running_narration
    requires: project.narration_progress >= project.video.duration
    ensures: project.status = completed
}

------------------------------------------------------------
-- Surfaces
------------------------------------------------------------

surface AnalysisDashboard {
    facing user: User 
    
    context project: Project
    
    exposes:
        project.status
        project.chunks
        project.actions
        project.narrative_steps
        
    provides:
        UserStartsAnalysis(project)
}

surface AutomationCompiler {
    facing bot: System
    
    context project: Project
    
    -- The compiler reads the relational graph and filters out human mistakes
    let golden_path_actions = project.actions where is_error_recovery = false
    
    exposes:
        project.narrative_steps
        golden_path_actions
        
    guarantee: NoErrorRecoveryReplication
        -- Asserts that scripts exported by this surface will never
        -- execute actions flagged as is_error_recovery.
}
