import { randomUUID } from "node:crypto";

export class ApiError extends Error {
  constructor(status, method, path, body) {
    super(
      `API ${method} ${path} failed with HTTP ${status}: ${body?.code || "request failed"}`,
    );
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

export class ApiClient {
  constructor({ baseUrl, timeoutMs = 15000, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.accessToken = undefined;
    this.cookie = "";
    this.csrfToken = undefined;
    this.refreshing = false;
  }

  updateCookies(response) {
    const cookies = new Map(
      this.cookie
        .split("; ")
        .filter(Boolean)
        .map((item) => [item.split("=", 1)[0], item]),
    );
    for (const line of response.headers.getSetCookie?.() || []) {
      const pair = line.split(";", 1)[0];
      cookies.set(pair.split("=", 1)[0], pair);
    }
    this.cookie = [...cookies.values()].join("; ");
  }

  async raw(method, path, { body, headers = {}, retryAuth = true } = {}) {
    const requestHeaders = {
      accept: "application/json",
      "x-request-id": randomUUID(),
      ...headers,
    };
    if (body !== undefined) requestHeaders["content-type"] = "application/json";
    if (this.accessToken)
      requestHeaders.authorization = `Bearer ${this.accessToken}`;
    if (this.cookie) requestHeaders.cookie = this.cookie;
    if (this.csrfToken && this.cookie.includes("refresh_token="))
      requestHeaders["x-csrf-token"] = this.csrfToken;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error",
    });
    this.updateCookies(response);
    if (
      response.status === 401 &&
      retryAuth &&
      this.cookie.includes("refresh_token=")
    ) {
      await this.refresh();
      return this.raw(method, path, { body, headers, retryAuth: false });
    }
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) throw new ApiError(response.status, method, path, result);
    return result;
  }

  async login(email, password) {
    const result = await this.raw("POST", "/auth/login", {
      body: { email, password },
      retryAuth: false,
    });
    this.accessToken = result.accessToken;
    this.csrfToken = result.csrfToken;
    return result;
  }

  async refresh() {
    if (this.refreshing)
      throw new Error(
        "Concurrent session refresh is not supported by the QA client",
      );
    this.refreshing = true;
    try {
      const result = await this.raw("POST", "/auth/refresh", {
        retryAuth: false,
      });
      this.accessToken = result.accessToken;
      this.csrfToken = result.csrfToken;
    } finally {
      this.refreshing = false;
    }
  }

  async request(method, path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const retryable = method === "GET" || Boolean(headers["Idempotency-Key"]);
    try {
      return await this.raw(method, path, { ...options, headers });
    } catch (error) {
      if (retryable && (error.name === "TimeoutError" || error.status >= 500))
        return this.raw(method, path, { ...options, headers });
      throw error;
    }
  }
  get(path) {
    return this.request("GET", path);
  }
  post(path, body, key) {
    return this.request("POST", path, {
      body,
      headers: key ? { "Idempotency-Key": key } : {},
    });
  }
  patch(path, body) {
    return this.request("PATCH", path, { body });
  }
}
