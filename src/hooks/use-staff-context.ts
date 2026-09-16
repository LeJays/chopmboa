import { useAction } from "@/lib/neon-actions";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/neon-actions";
import type { StaffRoleName } from "@/lib/chopmboa";

/* ====================================================================== */
/* ChopMboa — connexion par rôle                                          */
/* Résout l'identité + le rôle de l'utilisateur connecté depuis Neon      */
/* (staff.whoAmI) : chaque rôle arrive sur son espace de travail.         */
/* ====================================================================== */

export interface StaffContext {
  userId: string;
  fullName: string;
  email: string | null;
  role: "owner" | StaffRoleName | null;
  restaurants: { id: string; name: string; isOwner: boolean }[];
  primaryRestaurantId: string | null;
  primaryRestaurantName: string | null;
}

/** Destination after sign-in for each role. */
export const ROLE_HOME: Record<string, string> = {
  owner: "/dashboard",
  manager: "/dashboard",
  kitchen: "/kitchen",
  cashier: "/pos",
  waiter: "/waiter",
  delivery: "/deliveries",
};

export function useStaffContext(): {
  context: StaffContext | undefined;
  loading: boolean;
  homePath: string;
  refresh: () => void;
} {
  const whoAmI = useAction(api.staff.whoAmI);

  // Plain fetch-on-mount (not usePollAction): role rarely changes mid-session.
  const state = useWhoAmIOnce(whoAmI);

  const context = state.data ?? undefined;
  const homePath = context?.role ? ROLE_HOME[context.role] ?? "/dashboard" : "/dashboard";

  return { context, loading: state.loading, homePath, refresh: state.refresh };
}

function useWhoAmIOnce(
  run: () => Promise<StaffContext | null>,
): { data: StaffContext | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<StaffContext | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const [tick, setTick] = useState(0);

  const runOnce = useCallback(async () => {
    setLoading(true);
    try {
      const result = await run();
      if (mounted.current) setData(result);
    } catch (err) {
      console.warn("whoAmI error:", err);
      if (mounted.current) setData(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    mounted.current = true;
    void runOnce();
    return () => {
      mounted.current = false;
    };
  }, [runOnce, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}
