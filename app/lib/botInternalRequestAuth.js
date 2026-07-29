export async function authenticateInternalBotRequest({
  request,
  verifier,
} = {}) {
  if (typeof verifier !== "function") {
    return {
      ok: false,
      status: 401,
      code: "internal_auth_not_configured",
    };
  }

  try {
    const result = await verifier(request);
    if (result?.ok !== true) {
      return {
        ok: false,
        status: result?.status === 403 ? 403 : 401,
        code: "internal_request_not_authorized",
      };
    }

    return {
      ok: true,
      principal: result.principal || null,
    };
  } catch {
    return {
      ok: false,
      status: 401,
      code: "internal_request_not_authorized",
    };
  }
}
