import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create workspace — NimbusERP" }] }),
  component: SignUpPage,
});

const FEATURES = [
  "Dedicated workspace & database",
  "POS, inventory, purchases & sales",
  "Multi-warehouse & barcode support",
  "Ready in under 60 seconds",
];

function SignUpPage() {
  const navigate = useNavigate();
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [plan, setPlan] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (!plan) return toast.error("Please choose a plan");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: company, company_name: company, plan },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Workspace created — welcome to NimbusERP");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.4fr_1fr]">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-center overflow-hidden bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 px-16 py-20 text-white lg:flex">
        <div className="pointer-events-none absolute -left-10 bottom-20 h-32 w-32 rounded-2xl bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute right-20 top-1/2 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute left-24 bottom-32 h-24 w-24 rounded-xl bg-white/10" />
        <div className="relative max-w-xl">
          <div className="mb-10 grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <Box className="h-7 w-7" />
          </div>
          <h1 className="text-5xl font-bold leading-tight tracking-tight">
            Launch your<br />business<br />in minutes
          </h1>
          <p className="mt-6 max-w-md text-white/85">
            Get your own dedicated workspace with full inventory management, and everything you need to run your business.
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
      <div className="flex flex-col bg-background px-6 py-10 sm:px-12 lg:px-12">
        <div className="mx-auto w-full max-w-md flex-1">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">NimbusERP</span>
          </div>

          <h2 className="text-3xl font-bold tracking-tight">Create your workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Set up your admin account and we'll get your workspace ready.
          </p>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1 rounded-full bg-muted" />
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company name</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="company"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                  className="h-11 pl-9 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Admin email</Label>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pass">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pass"
                    type={showPass ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 chars"
                    className="h-11 px-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm</Label>
                <div className="relative">
                  <CheckCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPass ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat"
                    className="h-11 pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter — Free trial</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:opacity-95"
            >
              {loading ? "Creating workspace…" : (<>Create workspace <ArrowRight className="ml-1 h-4 w-4" /></>)}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/auth" className="font-semibold text-blue-600 hover:text-blue-700">
              Sign in
            </Link>
          </p>

          <Link
            to="/"
            className="mt-3 flex h-11 items-center justify-center gap-2 rounded-md border bg-muted/40 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Back to homepage
          </Link>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} NimbusERP. All rights reserved.
        </p>
      </div>
    </div>
  );
}
