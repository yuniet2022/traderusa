import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { handleTrpcRequest } from "./trpcHandler";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", (c) => handleTrpcRequest(c.req.raw));
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  // Railway can start an image without running the configured pre-deploy step.
  // Prepare the same database used by this process before accepting requests.
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    console.log("[STARTUP_SETUP] Preparando la base y el administrador de Railway.");
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL("./init-database.js", import.meta.url))], {
        stdio: "inherit", timeout: 90_000,
      });
      execFileSync(process.execPath, [fileURLToPath(new URL("./create-admin.js", import.meta.url)), "--if-needed"], {
        stdio: "inherit", timeout: 90_000,
      });
    } catch {
      console.error("[STARTUP_SETUP_FAILED] No se inició la web. Revisa los mensajes de preparación anteriores y las variables del servicio.");
      process.exit(1);
    }
  }

  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
