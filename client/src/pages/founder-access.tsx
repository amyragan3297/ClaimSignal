import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Check, Lock, Crown, Sparkles } from "lucide-react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

const requestSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  companyName: z.string().min(2, "Company name required"),
  phone: z.string().optional(),
  estimatedMonthlyClaimVolume: z.string().optional(),
  reasonForJoining: z.string().optional(),
  inviteCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export default function FounderAccessPage() {
  const { toast } = useToast();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<"info" | "login" | "request">("info");

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { fullName: "", email: "", companyName: "", phone: "", estimatedMonthlyClaimVolume: "", reasonForJoining: "", inviteCode: "" },
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onRequestSubmit(data: z.infer<typeof requestSchema>) {
    try {
      setLoading(true);
      const res = await apiRequest("POST", "/api/founder-access/request", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Request failed");
      }
      setSubmitted(true);
      toast({ title: "Request submitted", description: "Your Founder access request is pending review." });
    } catch (err) {
      toast({ title: "Submission failed", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(data: z.infer<typeof loginSchema>) {
    try {
      setLoginLoading(true);
      await login(data.email, data.password);
      toast({ title: "Welcome back", description: "Redirecting to Founder dashboard..." });
    } catch (err) {
      toast({ title: "Login failed", description: err instanceof Error ? err.message : "Invalid credentials", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-500/3 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4 hover-elevate px-2 py-1 rounded-md">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center justify-center mb-2">
            <img src={logoImg} alt="ClaimSignal" className="h-20 w-auto object-contain" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight">Founder Access</h1>
          </div>
          <p className="text-sm text-muted-foreground">Invitation Only · $79/month locked pricing</p>
        </div>

        {mode === "info" && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-500">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-semibold text-sm">Founding Partner Program</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Founder tier is a limited, invitation-only program for early adopters
                  who want to shape the future of ClaimSignal. Lock in $79/month for life
                  while the subscription remains active.
                </p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> $79/month locked forever
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> 14-day trial included
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> Full platform access
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> Founder-only features
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <Button className="w-full" onClick={() => setMode("login")} data-testid="button-founder-login">
                  Founder Login
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setMode("request")} data-testid="button-founder-request">
                  Request Founder Access
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Already have an invite code? Use the login form above.
              </p>
            </CardContent>
          </Card>
        )}

        {mode === "login" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Founder Login</h2>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="you@company.com" data-testid="input-founder-email" {...loginForm.register("email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" placeholder="Enter password" data-testid="input-founder-password" {...loginForm.register("password")} />
                </div>
                <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-founder-submit">
                  {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Log In
                </Button>
              </form>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setMode("info")}>
                Back to Founder Access
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "request" && !submitted && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Request Founder Access</h2>
              <p className="text-sm text-muted-foreground">
                Submit your details. Master Admin approval is required.
              </p>
              <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="req-name">Full Name</Label>
                  <Input id="req-name" placeholder="John Smith" {...requestForm.register("fullName")} />
                  {requestForm.formState.errors.fullName && <p className="text-xs text-destructive">{requestForm.formState.errors.fullName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-email">Email</Label>
                  <Input id="req-email" type="email" placeholder="you@company.com" {...requestForm.register("email")} />
                  {requestForm.formState.errors.email && <p className="text-xs text-destructive">{requestForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-company">Company Name</Label>
                  <Input id="req-company" placeholder="Acme Restoration" {...requestForm.register("companyName")} />
                  {requestForm.formState.errors.companyName && <p className="text-xs text-destructive">{requestForm.formState.errors.companyName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-phone">Phone (optional)</Label>
                  <Input id="req-phone" placeholder="(555) 123-4567" {...requestForm.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-code">Invite Code (optional)</Label>
                  <Input id="req-code" placeholder="If you have one" {...requestForm.register("inviteCode")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="req-reason">Why do you want Founder access?</Label>
                  <Textarea id="req-reason" placeholder="Tell us about your interest..." {...requestForm.register("reasonForJoining")} />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-founder-request-submit">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Request
                </Button>
              </form>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setMode("info")}>
                Back to Founder Access
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "request" && submitted && (
          <Card>
            <CardContent className="p-6 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Request Received</h2>
              <p className="text-muted-foreground">
                Your Founder access request is pending Master Admin approval. You will be notified via email.
              </p>
              <Button variant="outline" onClick={() => setMode("info")}>
                Back to Founder Access
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
