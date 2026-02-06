import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Settings, Mail, Users, Shield, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";

interface SettingsData {
  contact_email?: string;
  company_name?: string;
  enable_ai_extraction?: string;
  enable_smart_upload?: string;
  default_supplement_status?: string;
  enable_email_notifications?: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<SettingsData>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await authFetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.settings) {
      setFormData(data.settings);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (settings: SettingsData) => {
      const res = await authFetch("/api/settings/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setHasChanges(false);
      toast({ title: "Settings saved", description: "Your settings have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleChange = (key: keyof SettingsData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
    <div className="space-y-6" data-testid="settings-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Manage your application preferences</p>
          </div>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="save-settings-btn"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Contact Information
            </CardTitle>
            <CardDescription>
              Configure contact details shown throughout the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                placeholder="Your Company Name"
                value={formData.company_name || ""}
                onChange={(e) => handleChange("company_name", e.target.value)}
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Support Email</Label>
              <Input
                id="contact_email"
                type="email"
                placeholder="support@example.com"
                value={formData.contact_email || ""}
                onChange={(e) => handleChange("contact_email", e.target.value)}
                data-testid="input-contact-email"
              />
              <p className="text-sm text-muted-foreground">
                This email will be shown for customer support inquiries
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              AI Features
            </CardTitle>
            <CardDescription>
              Control AI-powered document extraction and analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Smart Upload</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically extract claim data from uploaded documents
                </p>
              </div>
              <Switch
                checked={formData.enable_smart_upload !== "false"}
                onCheckedChange={(checked) => 
                  handleChange("enable_smart_upload", checked ? "true" : "false")
                }
                data-testid="switch-smart-upload"
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>AI Extraction</Label>
                <p className="text-sm text-muted-foreground">
                  Use AI to extract data from supplements and estimates
                </p>
              </div>
              <Switch
                checked={formData.enable_ai_extraction !== "false"}
                onCheckedChange={(checked) => 
                  handleChange("enable_ai_extraction", checked ? "true" : "false")
                }
                data-testid="switch-ai-extraction"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Settings
            </CardTitle>
            <CardDescription>
              Configure team login and access preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Send email updates for new claims and supplements
                </p>
              </div>
              <Switch
                checked={formData.enable_email_notifications === "true"}
                onCheckedChange={(checked) => 
                  handleChange("enable_email_notifications", checked ? "true" : "false")
                }
                data-testid="switch-email-notifications"
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="default_supplement_status">Default Supplement Status</Label>
              <select
                id="default_supplement_status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={formData.default_supplement_status || "pending"}
                onChange={(e) => handleChange("default_supplement_status", e.target.value)}
                data-testid="select-default-supplement-status"
              >
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="negotiating">Negotiating</option>
              </select>
              <p className="text-sm text-muted-foreground">
                Status assigned to new supplements by default
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </Layout>
  );
}
