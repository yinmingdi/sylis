const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const cookieHeader = (baseUrl, supplied) => {
  if (supplied.includes("=")) return supplied;
  const secure = new URL(baseUrl).protocol === "https:";
  const name = secure ? "__Host-sylis_admin_session" : "sylis_admin_session";
  return `${name}=${supplied}`;
};

export function createAdminApi() {
  const baseUrl = requiredEnvironment("SYLIS_ADMIN_BASE_URL").replace(
    /\/$/,
    "",
  );
  const csrfToken = requiredEnvironment("SYLIS_ADMIN_CSRF_TOKEN");
  const cookie = cookieHeader(
    baseUrl,
    requiredEnvironment("SYLIS_ADMIN_COOKIE"),
  );
  const origin =
    process.env.SYLIS_ADMIN_ORIGIN?.trim() || new URL(baseUrl).origin;

  return async function request(
    path,
    { method = "GET", body, idempotencyKey } = {},
  ) {
    const headers = new Headers({
      Accept: "application/json",
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": csrfToken,
    });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { text: text.slice(0, 2_000) };
    }
    if (!response.ok) {
      const error = new Error(
        `Admin API ${method} ${path} failed with HTTP ${response.status}`,
      );
      error.details = payload;
      throw error;
    }
    return payload;
  };
}
