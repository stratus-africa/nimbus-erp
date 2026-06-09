import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Box, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — StratusPOS" }] }),
  component: SignInPage,
});

const FEATURES = [
  "Dedicated workspace & database",
  "POS, inventory, purchases & sales",
  "Multi-warehouse & barcode support",
  "Ready in under 60 seconds",
];

function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.4fr_1fr]">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-center overflow-hidden bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 px-16 py-20 text-white lg:flex">
        <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative max-w-xl">
          <div className="mb-10 grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Box className="h-7 w-7" />
          </div>
          <h1 className="text-5xl font-bold leading-tight tracking-tight">
            Welcome back to<br />StratusPOS
          </h1>
          <p className="mt-6 max-w-md text-white/85">
            Sign in to manage your inventory, sales and team — all from one workspace.
          </p>
          <div className="my-8 h-px bg-white/25" />
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/95">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col bg-background px-6 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md flex-1">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          <div className="mt-24">
            <h2 className="text-3xl font-bold tracking-tight">Sign in to your workspace</h2>
            <p className="mt-2 text-muted-foreground">Enter your email and password below.</p>

            <form onSubmit={onSignIn} className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="h-11 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="h-11 px-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Toggle password visibility"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-95"
              >
                {loading ? "Signing in…" : (<>Sign in <ArrowRight className="ml-1 h-4 w-4" /></>)}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link to="/signup" className="font-semibold text-emerald-600 hover:text-emerald-700">
                Create workspace
              </Link>
            </p>
          </div>
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} StratusPOS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
