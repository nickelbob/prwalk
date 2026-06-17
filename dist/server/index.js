import express from "express";
import { createServer } from "node:http";
import { join } from "node:path";
import { ReviewStore } from "./persistence.js";
import { apiRouter } from "./routes.js";
import { resolveClientDir } from "../cli/resolveAssets.js";
export async function startServer(opts) {
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
    app.use("/api", apiRouter(store, { readOnly: opts.readOnly ?? false }));
    const clientDir = opts.dev ? null : resolveClientDir();
    if (clientDir) {
        app.use(express.static(clientDir));
        // SPA fallback: any non-API GET serves index.html (client routes /r/:slug).
        app.get(/^(?!\/api).*/, (_req, res) => {
            res.sendFile(join(clientDir, "index.html"));
        });
    }
    else if (!opts.dev) {
        app.get(/^(?!\/api).*/, (_req, res) => {
            res
                .status(500)
                .send("prwalk: client assets not found. Run `npm run build` in the prwalk package.");
        });
    }
    const { server, port } = await listen(app, opts.port, opts.autoPort ?? true);
    return { server, port, url: `http://localhost:${port}` };
}
function listen(app, startPort, autoPort, maxTries = 10) {
    return new Promise((resolve, reject) => {
        let port = startPort;
        let tries = 0;
        const server = createServer(app);
        const tryListen = () => {
            server.listen(port, () => resolve({ server, port }));
        };
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE" && autoPort && tries < maxTries) {
                tries++;
                port++;
                setTimeout(tryListen, 0);
            }
            else {
                reject(err);
            }
        });
        tryListen();
    });
}
//# sourceMappingURL=index.js.map