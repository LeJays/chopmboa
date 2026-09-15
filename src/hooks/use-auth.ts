import { apiClient, type SessionUser } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    void apiClient.me().then(({ user: currentUser }) => {
      if (active) setUser(currentUser);
    }).catch(() => {
      if (active) setUser(null);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [tick]);

  const signIn = useCallback(async (
    _provider: string,
    options: { email: string; password: string; name?: string; flow?: "signUp" | "signIn" },
  ) => {
    if (options.flow === "signUp") {
      await apiClient.signUp(options.name ?? "", options.email, options.password);
    } else {
      await apiClient.signIn(options.email, options.password);
    }
    setTick((value) => value + 1);
  }, []);

  const signOut = useCallback(async () => {
    await apiClient.signOut();
    setUser(null);
  }, []);

  return {
    isLoading,
    isAuthenticated: user !== null,
    user,
    signIn,
    signOut,
  };
}
