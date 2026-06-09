import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Check, Lock, Crown, Sparkles, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

const redeemSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  companyName: z.string().min(2, "Organization name required"),
  inviteCode: z.string().min(6, "Invite code required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  agreeToTerms: z.boolean().refine((v) => v === true, "You must agree to the terms and conditions"),
});

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export default function FounderAccessPage() {
  const { toast } = useToast();
  const { login } = useAuth();
  const [loginLoading, setLoginLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const [, setVerified] = useState(false);
  const [, setVerifiedData] = useState<{ fullName: string; email: string; companyName: string } | null>(null);
  const [mode, setMode] = useState<"info" | "login" | "redeem">("info");

  const redeemForm = useForm<z.infer<typeof redeemSchema>>({
    resolver: zodResolver(redeemSchema),
    defaultValues: { fullName: "", email: "", companyName: "", inviteCode: "", password: "", agreeToTerms: false },
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onVerifyAndRedeem(data: z.infer<typeof redeemSchema>) {
    try {
      setRedeeming(true);

      // Step 1: Verify invitation
      const verifyRes = await apiRequest("POST", "/api/founder-access/verify", {
        inviteCode: data.inviteCode,
        email: data.email,
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.message || "Invalid invitation code");
      }
      const verifyJson = await verifyRes.json();
      setVerified(true);
      setVerifiedData(verifyJson.invitation);

      // Step 2: Redeem invitation
      const redeemRes = await apiRequest("POST", "/api/founder-access/redeem", {
        inviteCode: data.inviteCode,
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        companyName: data.companyName,
      });
      if (!redeemRes.ok) {
        const err = await redeemRes.json();
        throw new Error(err.message || "Redemption failed");
      }
      const redeemJson = await redeemRes.json();
      setRedeemed(true);
      toast({ title: "Welcome, Founder", description: "Your account is ready. Redirecting to dashboard..." });
      window.location.href = redeemJson.redirect || "/founder";
    } catch (err) {
      toast({
        title: "Redemption failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setRedeeming(false);
    }
  }

  async function onLogin(data: z.infer<typeof loginSchema>) {
    try {
      setLoginLoading(true);
      await login(data.email, data.password);
      toast({ title: "Welcome back", description: "Redirecting to Founder dashboard..." });
    } catch (err) {
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
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
                <Button className="w-full" onClick={() => setMode("redeem")} data-testid="button-founder-redeem">
                  <Mail className="w-4 h-4 mr-2" />
                  Redeem Invitation
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setMode("login")} data-testid="button-founder-login">
                  Founder Login
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Don&apos;t have an invitation? Founder access is invitation-only.
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

        {mode === "redeem" && !redeemed && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Redeem Founder Invitation</h2>
              <p className="text-sm text-muted-foreground">
                Enter your invitation details to create your Founder account.
              </p>
              <form onSubmit={redeemForm.handleSubmit(onVerifyAndRedeem)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="redeem-code">Invitation Code</Label>
                  <Input id="redeem-code" placeholder="CSF-XXXXXXXX" data-testid="input-redeem-code" {...redeemForm.register("inviteCode")} />
                  {redeemForm.formState.errors.inviteCode && <p className="text-xs text-destructive">{redeemForm.formState.errors.inviteCode.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-name">Full Name</Label>
                  <Input id="redeem-name" placeholder="John Smith" data-testid="input-redeem-name" {...redeemForm.register("fullName")} />
                  {redeemForm.formState.errors.fullName && <p className="text-xs text-destructive">{redeemForm.formState.errors.fullName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-email">Email</Label>
                  <Input id="redeem-email" type="email" placeholder="you@company.com" data-testid="input-redeem-email" {...redeemForm.register("email")} />
                  {redeemForm.formState.errors.email && <p className="text-xs text-destructive">{redeemForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-company">Organization Name</Label>
                  <Input id="redeem-company" placeholder="Acme Restoration" data-testid="input-redeem-company" {...redeemForm.register("companyName")} />
                  {redeemForm.formState.errors.companyName && <p className="text-xs text-destructive">{redeemForm.formState.errors.companyName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-password">Password</Label>
                  <Input id="redeem-password" type="password" placeholder="Min 8 characters" data-testid="input-redeem-password" {...redeemForm.register("password")} />
                  {redeemForm.formState.errors.password && <p className="text-xs text-destructive">{redeemForm.formState.errors.password.message}</p>}
                </div>
                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="redeem-terms"
                    data-testid="checkbox-redeem-terms"
                    checked={redeemForm.watch("agreeToTerms")}
                    onCheckedChange={(checked) => redeemForm.setValue("agreeToTerms", checked === true, { shouldValidate: true })}
                  />
                  <label htmlFor="redeem-terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    I agree to the{" "}
                    <Link href="/legal/founder" target="_blank" className="text-primary hover:underline">
                      Founding Partner Agreement
                    </Link>
                    {" "}and the{" "}
                    <Link href="/terms" target="_blank" className="text-primary hover:underline">
                      Terms of Service
                    </Link>
                    .
                  </label>
                </div>
                {redeemForm.formState.errors.agreeToTerms && <p className="text-xs text-destructive">{redeemForm.formState.errors.agreeToTerms.message}</p>}
                <Button type="submit" className="w-full" disabled={redeeming} data-testid="button-redeem-submit">
                  {redeeming && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Account &amp; Continue
                </Button>
              </form>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setMode("info")}>
                Back to Founder Access
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "redeem" && redeemed && (
          <Card>
            <CardContent className="p-6 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Welcome, Founder</h2>
              <p className="text-muted-foreground">
                Your Founder account is ready. You will be redirected to your dashboard.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/founder"}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
