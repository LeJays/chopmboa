import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { registerServiceWorker } from "@/lib/push-notifications";

// Enregistrer le Service Worker dès le démarrage (push en arrière-plan)
registerServiceWorker();

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const TableMenu = lazy(() => import("./pages/TableMenu.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const KitchenPage = lazy(() =>
  import("./pages/RoleWorkspaces.tsx").then((m) => ({ default: m.KitchenPage })),
);
const PosPage = lazy(() =>
  import("./pages/RoleWorkspaces.tsx").then((m) => ({ default: m.PosPage })),
);
const WaiterPage = lazy(() =>
  import("./pages/RoleWorkspaces.tsx").then((m) => ({ default: m.WaiterPage })),
);
const DeliveriesPage = lazy(() =>
  import("./pages/RoleWorkspaces.tsx").then((m) => ({
    default: m.DeliveriesPage,
  })),
);
const ReportsPage = lazy(() =>
  import("./pages/Reports.tsx").then((m) => ({ default: m.Reports })),
);
const RestaurantSettingsPage = lazy(() => import("./pages/RestaurantSettings.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/reports"
                element={
                  <RequireAuth>
                    <ReportsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <RestaurantSettingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/restaurant-settings"
                element={
                  <RequireAuth>
                    <RestaurantSettingsPage />
                  </RequireAuth>
                }
              />
              <Route path="/t/:token" element={<TableMenu />} />
              <Route
                path="/kitchen"
                element={
                  <RequireAuth>
                    <KitchenPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/pos"
                element={
                  <RequireAuth>
                    <PosPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/waiter"
                element={
                  <RequireAuth>
                    <WaiterPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/deliveries"
                element={
                  <RequireAuth>
                    <DeliveriesPage />
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
      </BrowserRouter>
      <Toaster />
    </RootErrorBoundary>
  </StrictMode>,
);
