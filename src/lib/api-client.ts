export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let body;
  try {
    body = await response.json();
  } catch (err) {
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    throw err;
  }
  if (!response.ok) throw new Error(body.error || "La requête a échoué.");
  return body;
}

export const apiClient = {
  me: () => request<{ user: SessionUser | null }>("/api/auth/me"),
  signIn: (email: string, password: string) =>
    request<{ ok: true }>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signUp: (fullName: string, email: string, password: string) =>
    request<{ ok: true }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password }),
    }),
  signOut: () =>
    request<{ ok: true }>("/api/auth/signout", { method: "POST" }),
};