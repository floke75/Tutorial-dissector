
------------------------------------------------------------
-- Actors
------------------------------------------------------------

actor User
actor System

------------------------------------------------------------
-- Value Types
------------------------------------------------------------

value ActionTarget {
    element: String
    location: String
    panel: String
    visual: String
    -- Normalized bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale
    spatial_bounding_box: List<Decimal>?
}

value UIComponent {
    type: UIComponentType
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

value UIState {
    application: String
    active_file: String?
    visible_panels: List<String>
    active_tool: String?
    open_dialogs: List<String>
    other_state: String
}

value LogMessage {
    id: String
    timestamp: Timestamp
    level: LogLevel
    message: String
    data: String?
}

value ProcessingState {
    status: ProcessingStatus
    current_chunk_index: Integer
    total_actions: Integer
    total_tokens: Integer
    start_time: Timestamp?
    last_interaction_id: String?
    chat_history: List<String>?
    learned_context: String?
    job_id: String?
    duration: Duration?
    logs: List<LogMessage>?
}

value InputData {
    keys_pressed: List<String>?
    text_typed: String?
}

------------------------------------------------------------
-- Enumerations
------------------------------------------------------------

enum ProcessingStatus { idle | running_visual | running_narrative | running_dedup | paused | completed | error | cancelled }
enum ChunkStatus { pending | analyzing_phase_a | analyzing_phase_b | analyzing_phase_c | completed | error }
enum ActionConfidence { high | medium | low }
enum ActorType { user | system }
enum ActionType { 
    click | double_click | right_click | drag | scroll | 
    type | keyboard_shortcut | hover | select | menu_navigate | 
    system_event | ui_response | transition
}
enum AnnotationType {
    title_card | lower_third | text_overlay | gui_highlight | zoom_in |
    transition | illustration | bullet_points | other
}
enum InsightType { explanation | rationale | tip | warning | workflow_framing | comparison }
enum UIComponentType { button | menu_item | tab | dropdown | checkbox | radio | input_field | toggle | link | modal | panel | other }
enum LogLevel { info | warn | error | success }

------------------------------------------------------------
-- Entities
------------------------------------------------------------

entity Project {
    id: String
    name: String
    video_url: String
    updated_at: Timestamp
    status: ProcessingStatus
    action_count: Integer
    
    -- Config for this run
    duration_input: String
    chunk_size: Duration
    overlap: Duration
    custom_context: String

    -- Relationships
    chunks: Chunk with project = this
    actions: ActionItem with project = this
    annotations: VideoAnnotation with project = this
    narrative_steps: NarrativeStep with project = this

    -- Runtime State
    proc_state: ProcessingState
    
    -- Context State
    latest_ui_state: UIState?
}

entity Chunk {
    project: Project
    index: Integer
    
    -- Time windows
    clip_start: Duration
    clip_end: Duration
    primary_start: Duration
    primary_end: Duration
    
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
    id: String                    -- Unique string (e.g. evt_a1b2c3d4)
    chunk_index: Integer?
    
    timestamp: String
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
    is_error_recovery: Boolean?
}

-- Editorial and contextual overlays
entity VideoAnnotation {
    project: Project
    id: String                    -- Unique string (e.g. ann_a1b2c3d4)
    chunk_index: Integer?
    
    timestamp: String
    annotation_type: AnnotationType
    content: String
    relevance: String
}

-- High-level BDD grouping
entity NarrativeStep {
    project: Project
    id: String
    
    timestamp: String
    intent: String
    precondition: String
    explanation: String
    postcondition: String
    insight_type: InsightType
    topics: List<String>
    
    -- Relational mapping to ActionItems and VideoAnnotations
    linked_visual_action_ids: List<String>
    linked_annotation_ids: List<String>?
}

------------------------------------------------------------
-- Config
------------------------------------------------------------

config {
    default_chunk_size: Duration = 60.seconds
    default_overlap: Duration = 30.seconds
    narration_context_buffer: Duration = 15.seconds
    spatial_normalization_max: Integer = 1000
}

------------------------------------------------------------
-- Rules
------------------------------------------------------------

rule StartAnalysis {
    when: UserStartsAnalysis(project)
    
    requires: project.status in { idle, paused, completed }
    requires: project.video_url != ""
    
    ensures: project.status = running_visual
    ensures: project.proc_state.status = running_visual
    ensures: project.updated_at = now
}

-- Visual Loop
rule CompletePhaseA {
    when: PhaseACompleted(chunk, raw_actions)
    requires: chunk.status = analyzing_phase_a
    ensures: chunk.status = analyzing_phase_b
    ensures: chunk.phase_a_raw_count = count(raw_actions)
}

rule CompletePhaseB {
    when: PhaseBCompleted(chunk, merged_actions, merged_annotations, ui_state)
    
    requires: chunk.status = analyzing_phase_b
    
    ensures: chunk.status = analyzing_phase_c
    ensures: chunk.project.latest_ui_state = ui_state
    ensures: chunk.action_count = count(merged_actions)
    
    -- Add Action Items (Mechanical layer)
    ensures: 
        for action in merged_actions:
            ActionItem.created(
                project: chunk.project,
                id: action.id,
                chunk_index: chunk.index,
                timestamp: action.timestamp,
                action_type: action.action_type,
                actor: action.actor,
                target: action.target,
                input_data: action.input_data,
                interacted_components: action.interacted_components,
                ui_context: action.ui_context,
                is_error_recovery: action.is_error_recovery,
                detail: action.detail,
                result: action.result,
                context_note: action.context_note,
                confidence: action.confidence
            )
            
    -- Add Video Annotations (Editorial layer)
    ensures:
        for annotation in merged_annotations:
            VideoAnnotation.created(
                project: chunk.project,
                id: annotation.id,
                chunk_index: chunk.index,
                timestamp: annotation.timestamp,
                annotation_type: annotation.annotation_type,
                content: annotation.content,
                relevance: annotation.relevance
            )
}

rule CompletePhaseC {
    when: PhaseCCompleted(chunk, narrative_steps, learned_insights)
    
    requires: chunk.status = analyzing_phase_c
    requires: chunk.project.status = running_narrative
    
    let context_window_start = chunk.clip_start - config.narration_context_buffer
    let context_window_end = chunk.clip_end + config.narration_context_buffer
    
    let visual_context = chunk.project.actions where 
        parse_mmss(timestamp) >= context_window_start and parse_mmss(timestamp) <= context_window_end
        
    let annotation_context = chunk.project.annotations where 
        parse_mmss(timestamp) >= context_window_start and parse_mmss(timestamp) <= context_window_end

    ensures: chunk.status = completed
    ensures: chunk.project.proc_state.current_chunk_index = chunk.index + 1
    
    -- Accumulate learned context
    ensures: chunk.project.proc_state.learned_context = chunk.project.proc_state.learned_context + "\n- " + learned_insights
    
    -- Add Narrative Steps (Intent layer)
    ensures:
        for step in narrative_steps:
            NarrativeStep.created(
                project: chunk.project,
                id: step.id,
                timestamp: step.timestamp,
                intent: step.intent,
                precondition: step.precondition,
                explanation: step.explanation,
                postcondition: step.postcondition,
                insight_type: step.insight_type,
                topics: step.topics,
                linked_visual_action_ids: step.linked_visual_action_ids,
                linked_annotation_ids: step.linked_annotation_ids
            )
}

rule GlobalDeduplication {
    when: GlobalDeduplicationCompleted(project, deduplicated_actions, old_to_new_id_map)
    requires: project.status = running_dedup
    requires: project.proc_state.current_chunk_index >= count(project.chunks)
    
    -- The actual deduplication logic replaces actions and remaps narrative links
    -- This is a complex graph operation, represented here as an atomic state transition
    ensures: project.status = completed
    ensures: project.proc_state.status = completed
    ensures: project.action_count = count(deduplicated_actions)
}

------------------------------------------------------------
-- Surfaces
------------------------------------------------------------

surface AnalysisDashboard {
    facing user: User 
    
    context project: Project
    
    exposes:
        project.status
        project.duration_input
        project.chunk_size
        project.overlap
        project.custom_context
        project.chunks
        project.actions
        project.annotations
        project.narrative_steps
        project.proc_state
        project.latest_ui_state
        
    provides:
        UserStartsAnalysis(project)
}

surface AutomationCompiler {
    facing bot: System
    
    context project: Project
    
    -- The compiler reads the relational graph and filters out human mistakes
    let golden_path_actions = project.actions where is_error_recovery != true
    
    exposes:
        project.narrative_steps
        golden_path_actions
        
    guarantee: NoErrorRecoveryReplication
        -- Asserts that scripts exported by this surface will never
        -- execute actions flagged as is_error_recovery.
}

