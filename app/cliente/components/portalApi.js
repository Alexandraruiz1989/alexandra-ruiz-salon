"use client";

import { supabase } from "../../lib/supabaseClient";

export async function getPortalSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function portalFetch(path, options = {}) {
  const session = await getPortalSession();

  if (!session?.access_token) {
    throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.error || "No se pudo completar la solicitud.");
  }

  return data;
}

export async function signOutClient() {
  await supabase.auth.signOut();
  window.location.href = "/cliente/login";
}
