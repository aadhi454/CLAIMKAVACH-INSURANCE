import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const PYTHON_BIN = process.env.PYTHON_BIN || (
  fs.existsSync(path.resolve(".venv/bin/python"))
    ? path.resolve(".venv/bin/python")
    : fs.existsSync(path.resolve(".venv/Scripts/python.exe"))
    ? path.resolve(".venv/Scripts/python.exe")
    : (process.platform === "win32" ? "python" : "python3")
);

type BridgeResult = {
    ok?: boolean;
    [key: string]: unknown;
};

type HospitalApiIdentity = {
  id: string;
  hospital_name: string;
  hms_provider: string;
  environment: "sandbox" | "production";
  status: "active";
};

type HospitalRequest = express.Request & {
  hospitalApiIdentity?: HospitalApiIdentity;
};

async function invokePythonBridge(
    action: string,
    args: Record<string, unknown> = {}
): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [path.resolve("cli_bridge.py"), action], {
      cwd: path.resolve("."),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const maxOutputBytes = 15 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let settled = false;

    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout, "utf8") > maxOutputBytes) {
        child.kill();
        fail(new Error("Python bridge response exceeded the 15 MB limit."));
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => fail(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(stderr.trim() || `Python bridge exited with code ${code}.`));
        return;
      }

      const lines = stdout.trim().split("\n");
      const lastLine = lines[lines.length - 1];
      try {
        const parsed: unknown = JSON.parse(lastLine);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("Bridge response must be a JSON object.");
        }
        settled = true;
        resolve(parsed as BridgeResult);
      } catch (error) {
        fail(
          new Error(
            `Python bridge returned invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    });

    child.stdin.end(JSON.stringify(args));
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 10, fileSize: 20 * 1024 * 1024 },
  });

  app.use(express.json({ limit: "30mb" }));

  app.get("/api/insurers", async (_req, res) => {
    try {
      const result = await invokePythonBridge("list_insurers", {});
      res.status(result.ok ? 200 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({ error: "INSURER_LIST_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/insurers/login", async (req, res) => {
    try {
      const result = await invokePythonBridge("authenticate_insurer", req.body || {});
      res.status(result.ok ? 200 : 401).json(result.ok ? result.data : {
        error: "INVALID_INSURER_CREDENTIALS",
        message: "The insurer email or password is invalid.",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: "INSURER_LOGIN_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/insurers/register", async (req, res) => {
    try {
      const result = await invokePythonBridge("register_insurer", req.body || {});
      res.status(result.ok ? 201 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(400).json({ error: "INSURER_REGISTRATION_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/insurers/:id/rules", async (req, res) => {
    try {
      const result = await invokePythonBridge("create_insurer_rule", { ...req.body, insurer_id: req.params.id });
      res.status(result.ok ? 201 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(400).json({ error: "INSURER_RULE_CREATE_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/insurers/:id/policies", async (req, res) => {
    try {
      const result = await invokePythonBridge("list_insurer_policies", { insurer_id: req.params.id });
      res.status(result.ok ? 200 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({ error: "INSURER_POLICY_LIST_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/insurers/:id/claims", async (req, res) => {
    try {
      const result = await invokePythonBridge("list_dispatched_claims", { insurer_id: req.params.id });
      res.status(result.ok ? 200 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({ error: "INSURER_CLAIMS_LIST_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/claims/dispatched", async (_req, res) => {
    try {
      const result = await invokePythonBridge("list_dispatched_claims", {});
      res.status(result.ok ? 200 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({ error: "DISPATCHED_CLAIMS_LIST_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/claims/:id/status", async (req, res) => {
    try {
      const result = await invokePythonBridge("update_dispatched_claim_status", {
        claim_id: req.params.id,
        payer_status: req.body?.payer_status,
      });
      res.status(result.ok ? 200 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(400).json({ error: "PAYER_STATUS_UPDATE_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/claims/dispatch", async (req, res) => {
    try {
      const result = await invokePythonBridge("dispatch_claim", req.body || {});
      res.status(result.ok ? 201 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(400).json({ error: "CLAIM_DISPATCH_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  });

  const requireHospitalApiKey = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const authorization = req.header("authorization");
    const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
    const token = bearerToken || req.header("x-api-key")?.trim() || "";
    if (!token) {
      res.status(401).json({
        error: "INVALID_OR_REVOKED_API_KEY",
        message: "Provide a valid API key using Authorization: Bearer <token> or X-API-Key.",
      });
      return;
    }

    try {
      const result = await invokePythonBridge("authenticate_api_key", { token });
      if (!result.ok || !result.data || typeof result.data !== "object") {
        res.status(401).json({
          error: "INVALID_OR_REVOKED_API_KEY",
          message: "The API key is invalid or has been revoked.",
        });
        return;
      }
      (req as HospitalRequest).hospitalApiIdentity = result.data as HospitalApiIdentity;
      next();
    } catch (error: unknown) {
      res.status(500).json({
        error: "API_KEY_AUTHENTICATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  app.post("/api/v1/keys/generate", async (req, res) => {
    try {
      const result = await invokePythonBridge("generate_api_key", req.body || {});
      res.status(result.ok ? 201 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({
        error: "API_KEY_GENERATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/v1/keys", async (_req, res) => {
    try {
      const result = await invokePythonBridge("list_api_keys");
      res.status(result.ok ? 200 : 400).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({
        error: "API_KEY_LIST_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/v1/keys/demo", async (_req, res) => {
    try {
      const result = await invokePythonBridge("get_demo_api_key");
      res.status(result.ok ? 200 : 404).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({
        error: "DEMO_API_KEY_LOAD_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/v1/keys/:id/revoke", async (req, res) => {
    try {
      const result = await invokePythonBridge("revoke_api_key", { id: req.params.id });
      res.status(result.ok ? 200 : 404).json(result.ok ? result.data : result);
    } catch (error: unknown) {
      res.status(500).json({
        error: "API_KEY_REVOCATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/v1/developer", (_req, res) => {
    res.json({
      name: "ClaimKavach Hospital API",
      version: "v1",
      authentication: ["Authorization: Bearer <api-key>", "X-API-Key: <api-key>"],
      endpoints: {
        audit_claim: {
          method: "POST",
          path: "/api/v1/audit-claim",
          content_types: ["application/json", "multipart/form-data"],
        },
        keys: {
          generate: "POST /api/v1/keys/generate",
          list: "GET /api/v1/keys",
          revoke: "POST /api/v1/keys/:id/revoke",
        },
      },
      fhir_boundary: "FHIR R4 structure is checked locally; NHCX/HCX profile conformance and live submission are not implemented.",
    });
  });

  const handleAuditClaim = async (req: express.Request, res: express.Response) => {
    const startedAt = Date.now();
    try {
      const identity = (req as HospitalRequest).hospitalApiIdentity;
      if (!identity) {
        res.status(401).json({
          error: "INVALID_OR_REVOKED_API_KEY",
          message: "A valid hospital API key is required.",
        });
        return;
      }
      const payload: Record<string, unknown> = { ...(req.body || {}) };
      if (typeof payload.extracted_documents === "string") {
        payload.extracted_documents = JSON.parse(payload.extracted_documents);
      }
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (files.length > 0) {
        payload.documents = files.map((file) => ({
          filename: file.originalname,
          base64: file.buffer.toString("base64"),
        }));
      }
      payload._hospital_name = identity.hospital_name;
      payload._api_key_id = identity.id;
      payload._latency_ms = Date.now() - startedAt;
      const result = await invokePythonBridge("audit_claim", payload);
      if (!result.ok) {
        res.status(400).json({
          error: "CLAIM_AUDIT_FAILED",
          message: result.error || "The claim could not be audited.",
        });
        return;
      }
      const audit = result.data as Record<string, unknown>;
      const logged = await invokePythonBridge("log_api_request", {
        api_key_id: identity.id,
        endpoint: "/api/v1/audit-claim",
        insurer_id: String(payload.insurer_id || ""),
        diagnosis_code: String(payload.diagnosis_icd10 || ""),
        verdict: String(audit.status || "BLOCKED"),
        latency_ms: Date.now() - startedAt,
      });
      if (!logged.ok) {
        res.status(500).json({
          error: "API_REQUEST_LOG_FAILED",
          message: "The audit completed but its request log could not be persisted.",
        });
        return;
      }
      res.status(200).json(audit);
    } catch (error: unknown) {
      res.status(400).json({
        error: "INVALID_CLAIM_AUDIT_REQUEST",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  app.post(
    "/api/v1/audit-claim",
    requireHospitalApiKey,
    upload.array("documents", 10),
    handleAuditClaim
  );

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

  app.get("/api/report/:filename", (req, res) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.resolve("generated_reports", safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Assessment report not found" });
      return;
    }
    res.download(filePath, safeName, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: "Assessment report could not be downloaded" });
      }
    });
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
