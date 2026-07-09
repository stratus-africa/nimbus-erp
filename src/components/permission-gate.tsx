import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions, type Module, type PermAction } from "@/hooks/use-permissions";

/**
 * Client-side gate for a page or subtree. Renders a friendly denied screen
 * if the current user does not have the required permission. This is a UX
 * layer — the server (RLS + SECURITY DEFINER functions) is the enforcement
 * layer.
 */
export function PermissionGate({
  module,
  action = "view",
  children,
}: {
  module: Module;
  action?: PermAction;
  children: ReactNode;
}) {
  const { can, ready } = usePermissions();

  if (!ready) {
    return <div className="p-8 text-sm text-muted-foreground">Checking access…</div>;
  }

  if (!can(module, action)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-100 text-rose-700">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">You don't have access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role doesn't have permission to {action} <span className="font-medium">{module.replace(/_/g, " ")}</span>.
          Ask your workspace admin to grant access.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
