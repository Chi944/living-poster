export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (import.meta.env.VITE_HOSTED === "true") {
    const { hostedRequest } = await import("./hosted-api");
    try {
      return await hostedRequest(path, options);
    } catch (error) {
      throw new ApiError(
        error instanceof Error
          ? error.message
          : "Browser storage is unavailable.",
        (error as { status?: number }).status ?? 400,
      );
    }
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "The local server is unavailable. Your draft stays on this device.",
      0,
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok)
    throw new ApiError(
      data.error || `Request failed (${response.status}).`,
      response.status,
    );
  return data;
}
export const post = <T = any>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
export type Capabilities = {
  free: boolean;
  authenticated: boolean;
  needsSetup: boolean;
  ai: {
    available: boolean;
    model: string;
    reason?: string;
    connector?: { enabled: boolean; url: string; model: string };
  };
  storage: string;
  runtime?: "browser";
  sharePolicy?: "portable";
};
export type Project = {
  id: string;
  name: string;
  headRevisionId: string;
  updatedAt: string;
};
