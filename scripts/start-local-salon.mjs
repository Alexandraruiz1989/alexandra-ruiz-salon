import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import {
  assertLocalSupabaseEnvironment,
  localSupabaseGuardFailureMessage,
} from "./lib/localSupabaseGuard.mjs";

const runtimeDir = path.join(process.cwd(), ".local-salon-runtime");
const logPath = path.join(runtimeDir, "next-local.log");
const preferredPort = Number(process.env.LOCAL_SALON_PORT || 3000);

function parseMode() {
  const modeArg = process.argv.find((item) => item.startsWith("--mode="));
  const mode = String(modeArg?.slice("--mode=".length) || "legacy").toLowerCase();
  if (["legacy", "portal", "admin"].includes(mode)) return mode;
  throw new Error("Modo inválido. Usa --mode=legacy, --mode=portal o --mode=admin.");
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port <= startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port;
  }

  throw new Error("No encontré un puerto local disponible para Next.");
}

function buildModeEnv(mode) {
  const base = {
    APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "false",
    APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "false",
    APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED: "false",
    NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "false",
    NEXT_PUBLIC_APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "false",
    NEXT_PUBLIC_APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED: "false",
    BOT_APPOINTMENT_WRITES_ENABLED: "false",
    BOT_AI_ENABLED: "false",
  };

  if (mode === "portal") {
    base.APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED = "true";
    base.APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED = "true";
    base.NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED = "true";
    base.NEXT_PUBLIC_APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED = "true";
  }

  if (mode === "admin") {
    base.APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED = "true";
    base.APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED = "true";
    base.NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED = "true";
    base.NEXT_PUBLIC_APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED = "true";
  }

  return base;
}

function startNext({ local, mode, port }) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    logPath,
    `Inicio local ${new Date().toISOString()} · modo ${mode} · puerto ${port}\n`,
    "utf8"
  );

  const appUrl = `http://localhost:${port}`;
  const env = {
    ...process.env,
    ...buildModeEnv(mode),
    NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    NEXT_PUBLIC_SITE_URL: appUrl,
    NEXT_PUBLIC_APP_URL: appUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    __NEXT_PROCESSED_ENV: "true",
  };

  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm.cmd run dev -- --port ${port}`]
      : ["run", "dev", "--", "--port", String(port)];
  const child = spawn(command, args, {
    env,
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.once("exit", (code) => {
    logStream.end(`\nServidor local detenido con código ${code ?? "desconocido"}.\n`);
  });

  console.log("Servidor local de Alexandra Ruiz Salón iniciado.");
  console.log(`URL local: ${appUrl}`);
  console.log(`Modo de citas: ${mode}`);
  console.log("Supabase Local confirmado: sí.");
  console.log(
    `Citas transaccionales admin: ${
      env.APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED === "true" ? "activas" : "inactivas"
    }`
  );
  console.log(
    `Citas transaccionales portal: ${
      env.APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED === "true" ? "activas" : "inactivas"
    }`
  );
  console.log("Bot y WhatsApp: inactivos.");
  console.log(`Log local: ${logPath}`);

  return child;
}

try {
  const mode = parseMode();
  const local = assertLocalSupabaseEnvironment();
  const port = await findAvailablePort(preferredPort);
  startNext({ local, mode, port });
} catch (error) {
  console.error(
    `No se pudo iniciar el entorno local seguro: ${localSupabaseGuardFailureMessage(
      error
    )}`
  );
  process.exitCode = 1;
}
