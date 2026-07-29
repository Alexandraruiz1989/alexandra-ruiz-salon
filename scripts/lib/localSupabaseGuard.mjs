import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOCAL_HOST_PATTERN = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i;
const LOCAL_DB_PATTERN =
  /^(postgres(?:ql)?:\/\/)[^@]*@(127\.0\.0\.1|localhost):\d+\/[^\s]+$/i;
const PROJECT_REF_PATH = path.join("supabase", ".temp", "project-ref");
const CONTAINER_NAME = "supabase_db_alexandra-ruiz-salon";

const REMOTE_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SOURCE_DATABASE_URL",
];

function redactError(error) {
  const text = String(error?.message || error || "");
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "<DB_URL_REDACTED>")
    .replace(/https?:\/\/[^\s]+/gi, "<URL_REDACTED>");
}

function runTool(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 4,
    windowsHide: true,
  });
}

function parseJsonFromOutput(raw) {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("No se pudo leer el estado local de Supabase.");
  }

  return JSON.parse(text.slice(start, end + 1));
}

function readSupabaseStatus(cwd) {
  const candidates =
    process.platform === "win32"
      ? [
          ["cmd.exe", ["/d", "/s", "/c", "supabase.cmd status -o json"]],
          [
            "cmd.exe",
            ["/d", "/s", "/c", "npx.cmd --yes supabase status -o json"],
          ],
        ]
      : [
          ["supabase", ["status", "-o", "json"]],
          ["npx", ["--yes", "supabase", "status", "-o", "json"]],
        ];

  const errors = [];

  for (const [command, args] of candidates) {
    try {
      return parseJsonFromOutput(runTool(command, args, cwd));
    } catch (error) {
      errors.push(redactError(error));
    }
  }

  throw new Error(
    `No se pudo consultar Supabase Local. Último error: ${
      errors.at(-1) || "comando no disponible"
    }`
  );
}

function flattenEntries(value, prefix = "") {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, entry]) => {
    const currentKey = prefix ? `${prefix}.${key}` : key;

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return flattenEntries(entry, currentKey);
    }

    return [[currentKey, entry]];
  });
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findStatusValue(status, keyMatchers) {
  const normalizedMatchers = keyMatchers.map(normalizeKey);
  const entries = flattenEntries(status);

  for (const [key, value] of entries) {
    const normalizedKey = normalizeKey(key);
    if (normalizedMatchers.some((matcher) => normalizedKey.includes(matcher))) {
      const text = String(value || "").trim();
      if (text) return text;
    }
  }

  return "";
}

function isLocalHttpUrl(value) {
  return LOCAL_HOST_PATTERN.test(String(value || "").trim());
}

function isLocalDbUrl(value) {
  return LOCAL_DB_PATTERN.test(String(value || "").trim());
}

function assertNoLinkedProject(cwd) {
  const projectRefFile = path.join(cwd, PROJECT_REF_PATH);

  if (fs.existsSync(projectRefFile)) {
    throw new Error(
      "Bloqueado: existe supabase/.temp/project-ref. Esta tarea solo permite Supabase Local."
    );
  }
}

function stripTomlComments(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+#.*$/, ""))
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

function assertLocalConfig(cwd) {
  const configPath = path.join(cwd, "supabase", "config.toml");

  if (!fs.existsSync(configPath)) {
    throw new Error("Bloqueado: no existe supabase/config.toml.");
  }

  const config = stripTomlComments(fs.readFileSync(configPath, "utf8"));
  const checks = [
    {
      ok: /project_id\s*=\s*"alexandra-ruiz-salon"/.test(config),
      message: "project_id local inesperado.",
    },
    {
      ok: /\[api\][\s\S]*?port\s*=\s*54321/.test(config),
      message: "puerto local de API inesperado.",
    },
    {
      ok: /\[db\][\s\S]*?port\s*=\s*54322/.test(config),
      message: "puerto local de base de datos inesperado.",
    },
    {
      ok: /\[auth\][\s\S]*?site_url\s*=\s*"http:\/\/127\.0\.0\.1:3000"/.test(
        config
      ),
      message: "site_url local inesperado.",
    },
  ];

  const failed = checks.find((check) => !check.ok);

  if (failed) {
    throw new Error(`Bloqueado: ${failed.message}`);
  }
}

function assertNoRemoteEnv(env = process.env) {
  for (const name of REMOTE_ENV_NAMES) {
    const value = String(env[name] || "").trim();
    if (!value) continue;

    const looksLocal = name.includes("DB") || name.includes("POSTGRES")
      ? isLocalDbUrl(value) || isLocalHttpUrl(value)
      : isLocalHttpUrl(value);

    if (!looksLocal) {
      throw new Error(
        `Bloqueado: la variable ${name} apunta fuera de localhost. Limpia esa variable antes de iniciar pruebas locales.`
      );
    }
  }
}

function assertDockerHealthy(cwd) {
  let output = "";

  try {
    output = runTool(
      "docker",
      [
        "ps",
        "--filter",
        `name=${CONTAINER_NAME}`,
        "--format",
        "{{.Names}}\t{{.Status}}",
      ],
      cwd
    );
  } catch (error) {
    throw new Error(`No se pudo verificar Docker local: ${redactError(error)}`);
  }

  if (!output.includes(CONTAINER_NAME) || !/healthy/i.test(output)) {
    throw new Error(
      "Bloqueado: Supabase Local no está saludable. Ejecuta supabase start o revisa Docker Desktop."
    );
  }
}

function assertStatusLocal(status) {
  const apiUrl = findStatusValue(status, ["api_url", "api url"]);
  const dbUrl = findStatusValue(status, ["db_url", "db url", "database_url"]);
  const studioUrl = findStatusValue(status, ["studio_url", "studio url"]);
  const anonKey = findStatusValue(status, ["anon_key", "anon key"]);
  const serviceRoleKey = findStatusValue(status, [
    "service_role_key",
    "service_role key",
    "service key",
  ]);

  if (!isLocalHttpUrl(apiUrl)) {
    throw new Error("Bloqueado: la API de Supabase no apunta a localhost.");
  }

  if (dbUrl && !isLocalDbUrl(dbUrl)) {
    throw new Error("Bloqueado: la base de datos no apunta a localhost.");
  }

  if (studioUrl && !isLocalHttpUrl(studioUrl)) {
    throw new Error("Bloqueado: Studio no apunta a localhost.");
  }

  if (!anonKey || !serviceRoleKey) {
    throw new Error("Bloqueado: Supabase Local no devolvió llaves locales.");
  }

  return {
    apiUrl,
    anonKey,
    serviceRoleKey,
    dbUrl,
    studioUrl,
  };
}

export function assertLocalSupabaseEnvironment({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  assertNoLinkedProject(cwd);
  assertLocalConfig(cwd);
  assertNoRemoteEnv(env);
  assertDockerHealthy(cwd);

  const status = readSupabaseStatus(cwd);
  return assertStatusLocal(status);
}

export function localSupabaseGuardFailureMessage(error) {
  return redactError(error);
}
