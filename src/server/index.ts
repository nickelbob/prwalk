import express from "express";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ReviewStore } from "./persistence.js";
import { apiRouter } from "./routes.js";
import { resolveClientDir } from "../cli/resolveAssets.js";

export interface ServeOptions {
  repoRoot: string;
  port: number;
  /** When true, allow the OS to pick the next free port on conflict. */
  autoPort?: boolean;
  /** Dev mode: API only (Vite serves the client separately) + permissive CORS. */
  dev?: boolean;
}

export interface ServeHandle {
  server: Server;
  port: number;
  url: string;
}

export async function startServer(opts: ServeOptions): Promise<ServeHandle> {
  const app = express();
  app.use(express.json({ limit: "16mb" }));

  if (opts.dev) {
    app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });
    app.options(/.*/, (_req, res) => res.sendStatus(204));
  }

  const store = new ReviewStore(opts.repoRoot);
  app.use("/api", apiRouter(store));

  const clientDir = opts.dev ? null : resolveClientDir();
  if (clientDir) {
    app.use(express.static(clientDir));
    // SPA fallback: any non-API GET serves index.html (client routes /r/:slug).
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(join(clientDir, "index.html"));
    });
  } else if (!opts.dev) {
    app.get(/^(?!\/api).*/, (_req, res) => {
      res
        .status(500)
        .send("prwalk: client assets not found. Run `npm run build` in the prwalk package.");
    });
  }

  const { server, port } = await listen(app, opts.port, opts.autoPort ?? true);
  return { server, port, url: `http://localhost:${port}` };
}

function listen(
  app: express.Express,
  startPort: number,
  autoPort: boolean,
  maxTries = 10,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let tries = 0;
    const server = createServer(app);
    const tryListen = () => {
      server.listen(port, () => resolve({ server, port }));
    };
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && autoPort && tries < maxTries) {
        tries++;
        port++;
        setTimeout(tryListen, 0);
      } else {
        reject(err);
      }
    });
    tryListen();
  });
}
