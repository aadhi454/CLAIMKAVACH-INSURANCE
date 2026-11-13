import express from "express";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import dotenv from "dotenv";

dotenv.config();

const execFileAsync = promisify(execFile);
const PYTHON_BIN = process.env.PYTHON_BIN || (
  fs.existsSync(path.resolve(".venv/bin/python"))
    ? path.resolve(".venv/bin/python")
    : fs.existsSync(path.resolve(".venv/Scripts/python.exe"))
    ? path.resolve(".venv/Scripts/python.exe")
    : (process.platform === "win32" ? "python" : "python3")
);

async function invokePythonBridge(action: string, args: Record<string, unknown> = {}) {
  const { stdout } = await execFileAsync(
    PYTHON_BIN,
    [path.resolve("cli_bridge.py"), action, JSON.stringify(args)],
    {
      cwd: path.resolve("."),
      maxBuffer: 15 * 1024 * 1024,
      env: { ...process.env },
    }
  );
  const lines = stdout.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  return JSON.parse(lastLine);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "30mb" }));

  // Serve generated synthetic PDFs for inspection/download
  app.get("/api/sample-pdf/:filename", (req, res) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.resolve("sample_data", safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Sample PDF not found" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath);
  });

  app.get("/api/state", async (req, res) => {
    try {
      const claimId = typeof req.query.claim_id === "string" ? req.query.claim_id : undefined;
      const result = await invokePythonBridge("state", { claim_id: claimId });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/action", async (req, res) => {
    try {
      const { action, payload } = req.body || {};
      const result = await invokePythonBridge(action, payload || {});
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve("dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClaimKavach MVP v2 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
