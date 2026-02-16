
-- tutorial-dissector.allium
-- Scope: Domain logic for the Tutorial Dissector application
-- Includes: Projects, Chunks, Actions, Analysis Pipeline
-- Excludes: UI rendering logic, generic storage implementation details

config {
    default_chunk_size: Duration = 5.minutes
    default_overlap: Duration = 60.seconds
    narration_chunk_size: Duration = 15.minutes
    narration_context_buffer: Duration = 15.seconds
}

------------------------------------------------------------
-- Enumerations
------------------------------------------------------------

enum ProcessingStatus { idle | running_visual | running_narration | paused | completed | error }
enum ChunkStatus { pending | analyzing_phase_a | analyzing_phase_b | completed | error }
enum ActionConfidence { high | medium | low }
enum ActorType { user | system | narrator }
enum ActionType { 
    click | double_click | right_click | drag | scroll | 
    type | keyboard_shortcut | hover | select | menu_navigate | 
    system_event | ui_response | transition | narration_cue | chunk_boundary |
    narration
}
enum InsightType { explanation | rationale | tip | warning | workflow_framing | comparison }

------------------------------------------------------------
-- Value Types
------------------------------------------------------------

value ActionTarget {
    element: String
    location: String
    panel: String
    visual: String
}

value VideoMetadata {
    url: String
    title: String?
    duration: Duration
}

value UIState {
    application: String
    active_file: String?
    visible_panels: List<String>
    active_tool: String?
    open_dialogs: List<String>
    other_state: String
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

    -- State tracking
    current_chunk_index: Integer
    narration_progress: Duration
    total_tokens_used: Integer
    
    -- Latest detected UI Context (from Phase B)
    latest_ui_state: UIState?
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
    interaction_id: String?      -- Interactions API session ID
    action_count: Integer?
}

entity ActionItem {
    project: Project
    chunk_index: Integer?         -- Originating chunk (if visual)
    
    timestamp: Duration
    action_type: ActionType
    actor: ActorType
    target: ActionTarget
    detail: String
    result: String?
    confidence: ActionConfidence

    -- Narration Specific
    text: String?
    topics: List<String>?
    insight_type: InsightType?
    relates_to: String?           -- Logical link to visual timestamp
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

rule PauseAnalysis {
    when: UserPausesAnalysis(project)
    
    requires: project.status in { running_visual, running_narration }
    
    ensures: project.status = paused
    ensures: project.updated_at = now
}

-- Visual Loop
rule AnalyzeChunkPhaseA {
    when: SystemStartsPhaseA(chunk)
    
    requires: chunk.status = pending
    requires: chunk.project.status = running_visual
    
    ensures: chunk.status = analyzing_phase_a
}

rule CompletePhaseA {
    when: PhaseACompleted(chunk, raw_actions)
    
    requires: chunk.status = analyzing_phase_a
    
    ensures: chunk.status = analyzing_phase_b
    ensures: chunk.phase_a_raw_count = raw_actions.count
}

rule CompletePhaseB {
    when: PhaseBCompleted(chunk, merged_actions, ui_state, next_interaction_id)
    
    requires: chunk.status = analyzing_phase_b
    
    ensures: chunk.status = completed
    ensures: chunk.interaction_id = next_interaction_id
    ensures: chunk.action_count = merged_actions.count
    
    -- Update Project State
    ensures: chunk.project.current_chunk_index = chunk.index + 1
    ensures: chunk.project.latest_ui_state = ui_state
    ensures: chunk.project.updated_at = now
    
    -- Add Actions
    ensures: 
        for action in merged_actions:
            ActionItem.created(
                project: chunk.project,
                chunk_index: chunk.index,
                timestamp: action.timestamp,
                action_type: action.type,
                actor: action.actor,
                target: action.target,
                detail: action.detail,
                result: action.result,
                confidence: action.confidence
            )
}

-- Transition to Narration
rule StartNarrationPhase {
    when: AllVisualChunksCompleted(project)

    requires: project.status = running_visual
    requires: project.chunks.all(c => c.status = completed)

    ensures: project.status = running_narration
    ensures: project.narration_progress = 0.seconds
}

-- Narration Loop
rule AnalyzeNarrationSegment {
    when: ProcessNextNarrationSegment(project, start_time, end_time)

    requires: project.status = running_narration

    -- Loose Anchoring Logic (Abstracted)
    let context_window_start = start_time - config.narration_context_buffer
    let context_window_end = end_time + config.narration_context_buffer
    
    let visual_context = project.actions where 
        timestamp >= context_window_start and timestamp <= context_window_end

    ensures:
        -- Create narration items
        project.narration_progress = end_time
}

rule CompleteProject {
    when: NarrationFinished(project)
    
    requires: project.status = running_narration
    requires: project.narration_progress >= project.video.duration
    
    ensures: project.status = completed
    ensures: project.updated_at = now
}

rule FailChunk {
    when: AnalysisFailed(chunk, error)
    
    ensures: chunk.status = error
    ensures: chunk.error_msg = error
    ensures: chunk.project.status = paused
}

------------------------------------------------------------
-- Surfaces
------------------------------------------------------------

surface AnalysisDashboard {
    facing user: User -- Implicit actor
    
    context project: Project
    
    exposes:
        project.status
        project.video
        project.chunks
        project.actions
        project.current_chunk_index
        project.narration_progress
        project.latest_ui_state
        
    provides:
        UserStartsAnalysis(project)
        UserPausesAnalysis(project)
}
