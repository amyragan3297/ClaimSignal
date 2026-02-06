import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Loader2, ArrowRight, ShieldAlert } from "lucide-react";
import { authFetch } from "@/lib/api";

export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const { refreshSession } = useAuth();
  const { toast } = useToast();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    
    if (!sessionId) {
      setVerifying(false);
      return;
    }

    authFetch(`/api/stripe/verify-subscription?session_id=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSuccess(true);
          refreshSession();
          toast({ title: "Success!", description: "Your subscription is now active." });
        } else {
          toast({ 
            title: "Verification Failed", 
            description: "We couldn't verify your subscription. Please contact support.",
            variant: "destructive" 
          });
        }
        setVerifying(false);
      })
      .catch(() => {
        toast({ 
          title: "Error", 
          description: "Failed to verify subscription",
          variant: "destructive" 
        });
        setVerifying(false);
      });
  }, []);

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Card className="bg-slate-800/50 border-slate-700 max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-amber-500 mx-auto mb-4" />
              <p className="text-white text-lg">Verifying your subscription...</p>
              <p className="text-slate-400 text-sm mt-2">This will only take a moment</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="bg-slate-800/50 border-slate-700 max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-500" />
            <span className="text-2xl font-bold text-white">ClaimSignal</span>
          </div>
          {success ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-green-600/20 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-500" />
                </div>
              </div>
              <CardTitle className="text-white text-2xl">Welcome to ClaimSignal!</CardTitle>
              <CardDescription className="text-slate-400">
                Your subscription is now active. You have full access to all features.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-white">Subscription Status</CardTitle>
              <CardDescription className="text-slate-400">
                We couldn't verify your subscription. If you completed payment, please wait a moment and try again.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {success && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">What's included:</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Full access to adjuster database
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Claim tracking & analytics
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Carrier intelligence reports
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  AI tactical advisor
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Document management
                </li>
              </ul>
            </div>
          )}

          <Button
            onClick={() => setLocation("/")}
            className="w-full bg-amber-600 hover:bg-amber-500"
            data-testid="button-go-dashboard"
          >
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {!success && (
            <Button
              variant="ghost"
              onClick={() => setLocation("/pricing")}
              className="w-full text-slate-400 hover:text-white"
              data-testid="button-back-pricing"
            >
              Back to Pricing
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
