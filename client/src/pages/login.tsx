/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Loader2 } from "lucide-react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { loginSchema, signupSchema } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LoginPage() {
  const { login, register: registerUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const defaultTab = searchParams.get("tab") === "register" ? "register" : "login";
  const defaultPlan = searchParams.get("plan") || "pro";

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", fullName: "", orgName: "", planType: defaultPlan as "pro" | "team" | "founder" | "enterprise" },
  });

  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  async function onLogin(data: z.infer<typeof loginSchema>) {
    try {
      setLoginLoading(true);
      await login(data.email, data.password);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  async function onRegister(data: z.infer<typeof signupSchema>) {
    if (data.planType === "enterprise") {
      window.location.href = "mailto:enterprise@claimsignal.com?subject=Enterprise Plan Inquiry";
      return;
    }

    try {
      setRegisterLoading(true);
      await registerUser(data);
      setLocation("/dashboard");
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setRegisterLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-accent/3 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover-elevate px-2 py-1 rounded-md">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center justify-center mb-2">
            <div className="flex items-center justify-center" data-testid="img-login-logo">
              <img src={logoImg} alt="ClaimSignal" className="h-24 w-auto object-contain" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Operational Intelligence Platform</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <Tabs defaultValue={defaultTab}>
              <TabsList className="w-full mb-6">
                <TabsTrigger value="login" className="flex-1" data-testid="tab-login">Log In</TabsTrigger>
                <TabsTrigger value="register" className="flex-1" data-testid="tab-register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="you@company.com"
                      data-testid="input-login-email"
                      {...loginForm.register("email")}
                    />
                    {loginForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter password"
                      data-testid="input-login-password"
                      {...loginForm.register("password")}
                    />
                    {loginForm.formState.errors.password && (
                      <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-login-submit">
                    {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Log In
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <Input
                      id="register-name"
                      placeholder="John Smith"
                      data-testid="input-register-name"
                      {...registerForm.register("fullName")}
                    />
                    {registerForm.formState.errors.fullName && (
                      <p className="text-xs text-destructive">{registerForm.formState.errors.fullName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="you@company.com"
                      data-testid="input-register-email"
                      {...registerForm.register("email")}
                    />
                    {registerForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-org">Organization Name</Label>
                    <Input
                      id="register-org"
                      placeholder="Acme Restoration"
                      data-testid="input-register-org"
                      {...registerForm.register("orgName")}
                    />
                    {registerForm.formState.errors.orgName && (
                      <p className="text-xs text-destructive">{registerForm.formState.errors.orgName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="At least 8 characters"
                      data-testid="input-register-password"
                      {...registerForm.register("password")}
                    />
                    {registerForm.formState.errors.password && (
                      <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-plan">Plan</Label>
                    <Select
                      value={registerForm.watch("planType")}
                      onValueChange={(value) => registerForm.setValue("planType", value as "pro" | "team" | "founder" | "enterprise")}
                      data-testid="select-register-plan"
                    >
                      <SelectTrigger id="register-plan" data-testid="select-trigger-plan">
                        <SelectValue placeholder="Select a plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pro" data-testid="select-item-pro">Pro - $199/mo</SelectItem>
                        <SelectItem value="team" data-testid="select-item-team">Team - $399/mo</SelectItem>
                        <SelectItem value="founder" data-testid="select-item-founder">Founding Partner - $99/mo (14-day trial, invitation only)</SelectItem>
                        <SelectItem value="enterprise" data-testid="select-item-enterprise">Enterprise - Contact sales</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={registerLoading} data-testid="button-register-submit">
                    {registerLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {registerForm.watch("planType") === "founder"
                      ? "Start 14-Day Free Trial"
                      : registerForm.watch("planType") === "enterprise"
                        ? "Contact Sales"
                        : "Get Started"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    {registerForm.watch("planType") === "founder"
                      ? "14-day free trial. Payment method required."
                      : registerForm.watch("planType") === "enterprise"
                        ? "Custom pricing for large organizations."
                        : "Immediate access. No trial period."}
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
