# Context & Extraction Pipeline Analysis: The `learnedContext` Issue

## 1. The Core Problem
The application features a mechanism to dynamically build up context (`state.learnedContext`) by extracting domain knowledge, UI terms, and workflow rules. The visual extraction prompts for Phase A and Phase B are designed to accept a `dynamicContext` string so they can identify elements using the correct domain terminology.

However, due to the sequential loop design in `server/jobManager.ts`, this context is structurally prevented from bridging to the visual extraction phases.

Execution Order:
1. **Loop 1 (`analyzeChunkPhaseA` & `analyzeChunkPhaseB`):** Iterates over all chunks. Visual actions are extracted and merged.
2. **Loop 2 (`analyzeChunkPhaseC`):** Iterates over all chunks to generate the "Narrative Track."

The `state.learnedContext` is populated using the `learned_insights` field returned by Phase C. Because Phase C executes strictly *after* Phase A and B have finished for the entire video, `state.learnedContext` is always empty while the visual chunks are being processed.

## 2. Consequences
* **Dumb Visual Extraction:** The visual extractor has to guess UI names throughout the entire video because it never receives the application-specific terminology learned by the narrative track.
* **Inconsistent Action Naming:** Even if Chunk 1's audio clearly explains "This is the Block Templates Manager", Phase A for Chunk 2 will still identify it generically (e.g., "the top left grid button") because the learned dictionary hasn't been updated.
* **Wasted Prompt Instructions:** The prompt templates for Phase A and B explicitly expect and handle this dynamic context, but it invariably resolves to an empty string.

## 3. The Root Cause in Code
Inside `server/jobManager.ts`:
```typescript
// Loop 1 iterates for all chunks
for (let i = startIndex; i < state.chunks.length; i++) {
  const dynamicContext = vocabularyContext + (state.learnedContext ? "\\n\\nLearned Domain Knowledge:\\n" + state.learnedContext : "");
  // Phase A
  // Phase B
}

// Loop 2 iterates for all chunks
for (let i = 0; i < narrationChunks.length; i++) {
  // Phase C runs here and updates state.learnedContext
  if (narrationResult.learned_insights) {
      const insight = `[Chunk ${formatMMSS(nChunk.clipStart)}]: ${narrationResult.learned_insights}\\n`;
      state.learnedContext = (state.learnedContext || "") + insight;
  }
}
```

## 4. Potential Solutions required for Remediation
To eliminate this "context rot" and align the pipeline with its intended design, a structural refactor is required.

**Option A: Chunk-by-Chunk Interleaved Execution**
Instead of processing all chunks through Phase A/B and then all through Phase C, process Chunk 1 entirely through Phase A -> Phase B -> Phase C. The `learned_insights` generated at the end of Chunk 1's Phase C will immediately populate `state.learnedContext` and be fed into Chunk 2's Phase A prompt.
* *Pros:* True progressive learning; utilizes the existing pipeline features perfectly.
* *Cons:* Requires re-wiring the `jobManager.ts` loop heavily, specifically concerning how chunk overlaps and narrative step tracking are handled.

**Option B: Narrative First Extraction (Phase C -> Phase A -> Phase B)**
Extract the Narrative Track (Phase C) for all chunks first (relying solely on the audio and video, without predefined visual actions). Build the dynamic context, and *then* run the visual extraction passes across the timeline.
* *Pros:* Maximum narrative context available for all visual chunks.
* *Cons:* Phase C currently relies directly on the `{visual_actions}` array generated in Phase A/B. To do this, Phase C would have to run "blind" visually or rely on native multimodal reasoning, which might degrade the step-to-action mapping quality.

**Option C: Preliminary Context Pass (Phase 0)**
Before kicking off the primary chunks, evaluate the first 30 seconds of the video, or the audio transcript, specifically to extract the target application's name and UI terminology. Pre-populate `state.learnedContext` using this Phase 0 data.
