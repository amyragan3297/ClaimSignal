import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { FileText, Mail, Phone, Clock, User, Building, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/api";

interface ServiceRequest {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  serviceType: string;
  stripePaymentId: string | null;
  claimDescription: string | null;
  carrierName: string | null;
  urgency: string | null;
  documentPaths: string[] | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminRequests() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRequests = async () => {
    try {
      const res = await authFetch('/api/service-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      } else {
        toast({ title: "Error", description: "Failed to load requests", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to load requests", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleSelectRequest = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.adminNotes || "");
    setStatus(request.status);
  };

  const handleSave = async () => {
    if (!selectedRequest) return;
    setSaving(true);

    try {
      const res = await authFetch(`/api/service-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Request updated" });
        fetchRequests();
        setSelectedRequest(prev => prev ? { ...prev, status, adminNotes } : null);
      } else {
        toast({ title: "Error", description: "Failed to update request", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update request", variant: "destructive" });
    }
    setSaving(false);
  };

  const serviceLabels: Record<string, string> = {
    expert_review: "Expert Claim Review",
    carrier_report: "Carrier Intelligence Report",
    training: "Training Session",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500",
    in_progress: "bg-blue-500",
    completed: "bg-green-500",
    cancelled: "bg-red-500",
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Service Requests</h1>
          <p className="text-slate-400">Manage customer requests for add-on services</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : requests.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Requests Yet</h3>
              <p className="text-slate-400">
                When customers submit service requests, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h2 className="text-lg font-medium text-white">All Requests ({requests.length})</h2>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {requests.map((request) => (
                  <Card
                    key={request.id}
                    className={`bg-slate-800/50 border-slate-700 cursor-pointer transition-all hover:border-amber-500/50 ${
                      selectedRequest?.id === request.id ? 'border-amber-500 ring-1 ring-amber-500' : ''
                    }`}
                    onClick={() => handleSelectRequest(request)}
                    data-testid={`request-card-${request.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-white">{request.customerName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {request.urgency === 'urgent' && (
                            <Badge variant="destructive" className="text-xs">Urgent</Badge>
                          )}
                          <Badge className={`${statusColors[request.status]} text-white text-xs`}>
                            {request.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-slate-400 mb-2">
                        {serviceLabels[request.serviceType] || request.serviceType}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(request.createdAt)}
                        </span>
                        {request.carrierName && (
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {request.carrierName}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              {selectedRequest ? (
                <Card className="bg-slate-800/50 border-slate-700 sticky top-6">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                      <span>{selectedRequest.customerName}</span>
                      <Badge className={`${statusColors[selectedRequest.status]} text-white`}>
                        {selectedRequest.status.replace('_', ' ')}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      {serviceLabels[selectedRequest.serviceType] || selectedRequest.serviceType}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Email</div>
                        <a
                          href={`mailto:${selectedRequest.customerEmail}`}
                          className="flex items-center gap-1 text-amber-500 hover:underline text-sm"
                        >
                          <Mail className="h-3 w-3" />
                          {selectedRequest.customerEmail}
                        </a>
                      </div>
                      {selectedRequest.customerPhone && (
                        <div>
                          <div className="text-xs text-slate-500 mb-1">Phone</div>
                          <a
                            href={`tel:${selectedRequest.customerPhone}`}
                            className="flex items-center gap-1 text-amber-500 hover:underline text-sm"
                          >
                            <Phone className="h-3 w-3" />
                            {selectedRequest.customerPhone}
                          </a>
                        </div>
                      )}
                    </div>

                    {selectedRequest.carrierName && (
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Insurance Carrier</div>
                        <div className="text-white text-sm">{selectedRequest.carrierName}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-slate-500 mb-1">Description</div>
                      <div className="text-slate-300 text-sm bg-slate-700/30 p-3 rounded-lg">
                        {selectedRequest.claimDescription || "No description provided"}
                      </div>
                    </div>

                    <div className="border-t border-slate-700 pt-4">
                      <div className="text-xs text-slate-500 mb-2">Update Status</div>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white" data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500 mb-2">Admin Notes</div>
                      <Textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        rows={3}
                        className="bg-slate-700/50 border-slate-600 text-white"
                        placeholder="Add internal notes about this request..."
                        data-testid="textarea-admin-notes"
                      />
                    </div>

                    <Button
                      onClick={handleSave}
                      className="w-full bg-amber-600 hover:bg-amber-500"
                      disabled={saving}
                      data-testid="button-save-request"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save Changes
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center">
                    <FileText className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">Select a request to view details</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
