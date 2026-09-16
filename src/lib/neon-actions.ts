import { useCallback } from "react";

export type ActionRef = string;

export const api = new Proxy({}, {
  get: (_target, moduleName: string) => new Proxy({}, {
    get: (_module, actionName: string) => `${moduleName}.${actionName}`,
  }),
}) as Record<string, Record<string, ActionRef>>;

export function useAction<TArgs extends Record<string, unknown>, TResult>(actionRef: ActionRef) {
  return useCallback(async (args?: TArgs): Promise<TResult> => {
    const response = await fetch(`/api/actions/${actionRef}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args ?? {}),
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
  }, [actionRef]);
}

export function useMutation<TArgs extends Record<string, unknown>, TResult>(actionRef: ActionRef) {
  return useAction<TArgs, TResult>(actionRef);
}