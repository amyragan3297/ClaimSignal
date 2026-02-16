import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Check, FileText, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const AGREEMENT_TEXT = `CLAIMSIGNAL FOUNDER AGREEMENT

Version 1.0 — Effective Date: Upon Signature

This Founder Access Agreement ("Agreement") is entered into between ClaimSignal, Inc. ("Company") and the undersigned individual or organization ("Founder").

1. GRANT OF ACCESS
The Company grants Founder access to the ClaimSignal platform at the Founder tier, which includes full unmasked access to claim data, carrier information, adjuster details, and all operational intelligence modules.

2. DATA HANDLING OBLIGATIONS
Founder agrees to:
(a) Maintain strict confidentiality of all unmasked data accessed through the platform.
(b) Not share, distribute, or export unmasked data to unauthorized third parties.
(c) Use claim data solely for legitimate business operations within their organization.
(d) Comply with all applicable federal and state data protection regulations.

3. FOUNDER TIER LIMITATIONS
(a) The Founder tier is limited to a maximum of three (3) subscriptions globally.
(b) Founder tier includes a 14-day free trial period.
(c) Continued access after the trial period requires an active paid subscription.

4. AUDIT AND COMPLIANCE
(a) Company reserves the right to audit Founder's data access patterns.
(b) Founder agrees to maintain audit-ready documentation of data usage.
(c) Any breach of data handling obligations may result in immediate access revocation.

5. INTELLECTUAL PROPERTY
All platform features, analytics models, and intelligence layers remain the exclusive intellectual property of ClaimSignal, Inc.

6. LIMITATION OF LIABILITY
THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. COMPANY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.

7. TERM AND TERMINATION
This Agreement remains in effect for the duration of the Founder's active subscription. Either party may terminate with 30 days written notice.

8. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Delaware.

By signing below, Founder acknowledges that they have read, understood, and agree to be bound by all terms and conditions of this Agreement.`;

export default function FounderLegalPage() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [agreed, setAgreed] = useState(false);

  const alreadySigned = !!user?.founderAgreement;
  const isFounder = user?.subscription?.tier === "founder";

  const signMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/legal/founder/sign", { version: "1.0" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetch();
      toast({ title: "Agreement signed", description: "You now have full unmasked data access." });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to sign agreement", description: err.message, variant: "destructive" });
    },
  });

  if (!isFounder) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Founder Tier Required</h2>
            <p className="text-sm text-muted-foreground mb-4">
              The founder agreement is only available to Founder tier subscribers.
            </p>
            <Button variant="outline" onClick={() => setLocation("/billing")} data-testid="button-go-billing">
              View Billing Options
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadySigned) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Agreement Signed</h2>
            <p className="text-sm text-muted-foreground mb-2">
              You signed the Founder Agreement on{" "}
              {user?.founderAgreement?.signedAt
                ? new Date(user.founderAgreement.signedAt).toLocaleDateString()
                : "—"}
            </p>
            <Badge variant="outline" className="mb-4">Version {user?.founderAgreement?.version}</Badge>
            <p className="text-sm text-muted-foreground">
              You have full unmasked data access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-legal-title">Founder Agreement</h1>
        <p className="text-sm text-muted-foreground">
          Review and sign the founder agreement to unlock full unmasked data access.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Agreement Terms — Version 1.0
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80 rounded-md border p-4 mb-6">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed" data-testid="text-agreement-content">
              {AGREEMENT_TEXT}
            </pre>
          </ScrollArea>

          <div className="flex items-start gap-3 mb-6">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(!!v)}
              data-testid="checkbox-agree"
            />
            <label htmlFor="agree" className="text-sm cursor-pointer leading-relaxed">
              I have read and agree to the ClaimSignal Founder Agreement terms and conditions. I understand that I am responsible for maintaining confidentiality of all unmasked data.
            </label>
          </div>

          <Button
            className="w-full"
            disabled={!agreed || signMutation.isPending}
            onClick={() => signMutation.mutate()}
            data-testid="button-sign-agreement"
          >
            {signMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Shield className="w-4 h-4" />
            Sign Founder Agreement
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
