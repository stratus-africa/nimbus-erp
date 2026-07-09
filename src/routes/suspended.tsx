import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/suspended")({
  head: () => ({
    meta: [
      { title: "Account Suspended — Nimbus ERP" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuspendedPage,
});

function SuspendedPage() {
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-lg w-full p-8 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">Your account is suspended</h1>
        <p className="text-muted-foreground">
          Access to this workspace has been suspended by an administrator. Please
          contact your workspace admin if you believe this is a mistake.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </Card>
    </div>
  );
}
