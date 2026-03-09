import "dotenv/config";
import express from "express";
import cors from "cors";
import { processVideoJob, getJobState, cancelJob } from "./server/jobManager.ts";

async function startServer() {
  console.log("Starting server initialization...");
  if (!process.env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not set in the environment. API calls will fail.");
  }
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
    console.warn("WARNING: CORS_ORIGIN is not set in production. Cross-origin requests may be rejected.");
  }
  app.use(cors({ origin: process.env.CORS_ORIGIN || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined) }));
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      apiKey = process.env.API_KEY;
    }
    if (apiKey === "MY_GEMINI_API_KEY") {
      apiKey = "";
    }
    res.json({ apiKey: apiKey || "" });
  });

  app.post("/api/metadata", async (req, res) => {
    try {
      const { videoUrl } = req.body;
      if (!videoUrl) {
        return res.status(400).json({ error: "videoUrl is required" });
      }
      
      const { fetchYouTubeDuration } = await import("./server/jobManager.ts");
      const duration = await fetchYouTubeDuration(videoUrl);
      res.json({ duration });
    } catch (error: any) {
      console.error("Failed to fetch metadata:", error);
      res.status(500).json({ error: error.message || "Failed to fetch metadata" });
    }
  });

  app.post("/api/process", async (req, res) => {
    try {
      const { jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, customContext } = req.body;
      let apiKey = req.body.apiKey;
      
      console.log("[API /process] Received request.");
      console.log("[API /process] Client provided apiKey:", apiKey ? (apiKey.length > 10 ? apiKey.substring(0, 5) + "..." : apiKey) : "none");
      console.log("[API /process] process.env.GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
      console.log("[API /process] process.env.API_KEY exists:", !!process.env.API_KEY);

      if (apiKey === "undefined" || apiKey === "null" || !apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "AISTUDIO_KEY_SELECTED") {
        apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
          apiKey = process.env.API_KEY;
        }
        if (apiKey === "MY_GEMINI_API_KEY") {
          apiKey = "";
        }
      }
      
      console.log("[API /process] Resolved apiKey exists:", !!apiKey);

      if (!videoUrl) {
        return res.status(400).json({ error: "videoUrl is required" });
      }
      if (!apiKey || apiKey === "undefined") {
        return res.status(400).json({ error: "apiKey is required. Please select an API key in AI Studio, or set the GEMINI_API_KEY environment variable if deployed." });
      }
      
      const jobId = await processVideoJob({ jobId: reqJobId, videoUrl, durationInput, chunkSize, overlap, customContext, apiKey });
      res.json({ jobId });
    } catch (error: any) {
      console.error("Failed to start job:", error);
      res.status(500).json({ error: error.message || "Failed to start job" });
    }
  });

  app.get("/api/process/:jobId", (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const state = getJobState(req.params.jobId);
    if (!state) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    // Strip chatHistory and ttlTimerId to prevent serialization errors
    const { chatHistory, ttlTimerId, ...safeState } = state;
    const sinceVersion = parseInt(req.query.since as string) || 0;
    const sinceLogIndex = parseInt(req.query.logSince as string) || 0;

    if (sinceVersion > 0 && sinceVersion === state.stateVersion) {
      let newLogs: any[];
      const capOccurred = state.logCapOccurred || false;
      if (capOccurred) {
        newLogs = state.logs;
        // Note: Mutating state on a GET request is a side-effect-on-read pattern.
        // This is functionally correct for a single-client polling scenario,
        // but if multiple clients poll simultaneously, only the first will receive
        // the logCapOccurred flag.
        state.logCapOccurred = false;
      } else {
        newLogs = sinceLogIndex > 0 ? state.logs.slice(sinceLogIndex) : [];
      }
      return res.json({
        status: state.status,
        progress: state.progress,
        stateVersion: state.stateVersion,
        lastUpdatedAt: state.lastUpdatedAt,
        logs: newLogs.length > 0 ? newLogs : undefined,
        logIndex: state.logs.length,
        logCapOccurred: capOccurred,
        unchanged: true
      });
    }

    // Note: Mutating state on a GET request is a side-effect-on-read pattern.
    if (state.logCapOccurred) state.logCapOccurred = false;
    res.json({ ...safeState, logIndex: state.logs.length, unchanged: false });
  });

  app.post("/api/process/:jobId/cancel", (req, res) => {
    const success = cancelJob(req.params.jobId);
    if (success) {
      res.json({ success: true, found: true });
    } else {
      res.json({ success: true, found: false });
    }
  });

  app.post("/api/test-integration", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || apiKey === "undefined") {
        return res.status(400).json({ error: "apiKey is required" });
      }

      const { analyzeChunkPhaseA } = await import("./services/geminiService.ts");
      const videoUrl = 'https://youtu.be/RHx-PGeh9xk?is=KcxIQuIjAfBbV_Iz';
      const startSec = 0;
      const endSec = 15;
      
      const logs: any[] = [];
      const result = await analyzeChunkPhaseA(
        videoUrl,
        startSec,
        endSec,
        startSec,
        endSec,
        0,
        'This is a live integration test evaluating the model performance.',
        apiKey,
        (level, msg, data) => {
          logs.push({ level, msg, data });
          console.log(`[TEST ${level.toUpperCase()}] ${msg}`);
        }
      );

      res.json({ success: true, result, logs });
    } catch (error: any) {
      console.error("Integration test failed:", error);
      res.status(500).json({ error: error.message || "Integration test failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    
    // SPA fallback
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `Unknown API route: ${req.method} ${req.path}` });
      }
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
