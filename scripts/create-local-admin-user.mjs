import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  assertLocalSupabaseEnvironment,
  localSupabaseGuardFailureMessage,
} from "./lib/localSupabaseGuard.mjs";

const runtimeDir = path.join(process.cwd(), ".local-salon-runtime");
const credentialsPath = path.join(runtimeDir, "admin-credentials.json");
const adminEmail = "administradora.prueba.local@example.invalid";
const adminName = "Administradora Prueba Local";
const adminStaffId = "10000000-0000-4000-8000-000000000901";

function generatePassword() {
  return `Local-${crypto.randomBytes(18).toString("base64url")}-2026!`;
}

function readExistingPassword() {
  if (!fs.existsSync(credentialsPath)) return "";

  try {
    const parsed = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    return String(parsed.password || "");
  } catch {
    return "";
  }
}

function saveCredentials({ password, userId }) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    credentialsPath,
    `${JSON.stringify(
      {
        localOnly: true,
        email: adminEmail,
        password,
        authUserId: userId,
        note: "Credenciales ficticias para Supabase Local. Archivo ignorado por Git.",
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function findUserByEmail(supabase, email) {
  const normalized = email.toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const users = data?.users || [];
    const user = users.find(
      (item) => String(item.email || "").toLowerCase() === normalized
    );

    if (user) return user;
    if (users.length < 1000) return null;
    page += 1;
  }

  return null;
}

async function upsertLocalAdmin() {
  const local = assertLocalSupabaseEnvironment();
  const supabase = createClient(local.apiUrl, local.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const password = readExistingPassword() || generatePassword();
  let user = await findUserByEmail(supabase, adminEmail);

  if (user) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        role: "admin",
      },
    });

    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        role: "admin",
      },
    });

    if (error) throw error;
    user = data.user;
  }

  const now = new Date().toISOString();
  const { error: staffError } = await supabase.from("staff").upsert(
    {
      id: adminStaffId,
      full_name: adminName,
      email: adminEmail,
      phone: "0000000901",
      role: "admin",
      active: true,
      auth_user_id: user.id,
      color: "#bd7b83",
      notes: "Registro ficticio para pruebas locales.",
      updated_at: now,
    },
    { onConflict: "id" }
  );

  if (staffError) throw staffError;

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      auth_user_id: user.id,
      email: adminEmail,
      full_name: adminName,
      role: "admin",
      staff_id: adminStaffId,
      active: true,
      updated_at: now,
    },
    { onConflict: "email" }
  );

  if (profileError) throw profileError;

  saveCredentials({ password, userId: user.id });

  console.log("Administradora ficticia local lista.");
  console.log(`Credenciales guardadas en: ${credentialsPath}`);
  console.log("No se imprimió la contraseña en consola.");
}

try {
  await upsertLocalAdmin();
} catch (error) {
  console.error(
    `No se pudo preparar la administradora local: ${localSupabaseGuardFailureMessage(
      error
    )}`
  );
  process.exitCode = 1;
}
