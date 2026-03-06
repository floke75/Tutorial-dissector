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
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/config", (req, res) => {
    let key = process.env.GEMINI_API_KEY;
    if (!key || key === "MY_GEMINI_API_KEY") {
      key = process.env.API_KEY;
    }
    if (key === "MY_GEMINI_API_KEY") {
      key = "";
    }
    res.json({ apiKey: key || "" });
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
      const { videoUrl, durationInput, chunkSize, overlap, customContext } = req.body;
      let apiKey = req.body.apiKey;
      if (apiKey === "undefined" || apiKey === "null" || !apiKey || apiKey === "MY_GEMINI_API_KEY") {
        apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
          apiKey = process.env.API_KEY;
        }
        if (apiKey === "MY_GEMINI_API_KEY") {
          apiKey = "";
        }
      }
      
      if (!videoUrl) {
        return res.status(400).json({ error: "videoUrl is required" });
      }
      if (!apiKey || apiKey === "undefined") {
        return res.status(400).json({ error: "apiKey is required. Please select an API key." });
      }
      
      const jobId = await processVideoJob({ videoUrl, durationInput, chunkSize, overlap, customContext, apiKey });
      res.json({ jobId });
    } catch (error: any) {
      console.error("Failed to start job:", error);
      res.status(500).json({ error: error.message || "Failed to start job" });
    }
  });

  app.get("/api/process/:jobId", (req, res) => {
    const state = getJobState(req.params.jobId);
    if (!state) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(state);
  });

  app.post("/api/process/:jobId/cancel", (req, res) => {
    const success = cancelJob(req.params.jobId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Job not found or already completed" });
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
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
