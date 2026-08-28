const API_BASE = "https://api.bitbucket.org/2.0";

function getAuthHeader() {
  const token = process.env.BITBUCKET_API_TOKEN;
  if (!token) {
    throw new Error(
      "BITBUCKET_API_TOKEN environment variable is not set. Configure it in your MCP client config."
    );
  }

  const username = process.env.BITBUCKET_USERNAME;
  if (username) {
    const basic = Buffer.from(`${username}:${token}`).toString("base64");
    return `Basic ${basic}`;
  }

  return `Bearer ${token}`;
}

export async function bitbucketRequest(path, { method = "GET", body, query } = {}) {
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE}${path}`
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      (data && data.error && data.error.message) ||
      (typeof data === "string" ? data : JSON.stringify(data));
    throw new Error(`Bitbucket API error ${res.status}: ${message}`);
  }

  return data;
}

export function defaultWorkspace(explicit) {
  const ws = explicit || process.env.BITBUCKET_WORKSPACE;
  if (!ws) {
    throw new Error(
      "No workspace provided and BITBUCKET_WORKSPACE is not set. Pass `workspace` explicitly or set the env var."
    );
  }
  return ws;
}
