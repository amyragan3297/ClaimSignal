import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Calendar, Building2, Users, Loader2, FileSpreadsheet, FileJson, Printer } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdjusters, fetchClaims, authFetch } from "@/lib/api";
import { format } from "date-fns";

type ReportType = 'claims-summary' | 'adjuster-profiles' | 'carrier-analysis' | 'interaction-history';

interface Report {
  id: string;
  type: ReportType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const reportTypes: Report[] = [
  {
    id: 'claims-summary',
    type: 'claims-summary',
    name: 'Claims Summary Report',
    description: 'Overview of all claims with status, amounts, and key dates',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    id: 'adjuster-profiles',
    type: 'adjuster-profiles',
    name: 'Adjuster Profiles Report',
    description: 'Detailed profiles of all tracked adjusters with notes and risk assessments',
    icon: <Users className="w-5 h-5" />,
  },
  {
    id: 'carrier-analysis',
    type: 'carrier-analysis',
    name: 'Carrier Analysis Report',
    description: 'Breakdown of performance and patterns by insurance carrier',
    icon: <Building2 className="w-5 h-5" />,
  },
  {
    id: 'interaction-history',
    type: 'interaction-history',
    name: 'Interaction History Report',
    description: 'Complete log of all interactions with adjusters',
    icon: <Calendar className="w-5 h-5" />,
  },
];

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'print'>('csv');
  const [generating, setGenerating] = useState(false);

  const { data: adjusters = [] } = useQuery({
    queryKey: ['adjusters'],
    queryFn: fetchAdjusters,
  });

  const { data: claims = [] } = useQuery({
    queryKey: ['claims'],
    queryFn: fetchClaims,
  });

  const generateReport = async () => {
    if (!selectedReport) return;
    setGenerating(true);

    try {
      let data: any[] = [];
      let filename = '';

      switch (selectedReport) {
        case 'claims-summary':
          data = claims.map((c: any) => ({
            'Claim ID': c.maskedId,
            'Carrier': c.carrier,
            'Status': c.status,
            'Date of Loss': c.dateOfLoss,
            'Homeowner': c.homeownerName || 'N/A',
            'Address': c.propertyAddress || 'N/A',
            'Notes': c.notes || '',
          }));
          filename = `claims-summary-${format(new Date(), 'yyyy-MM-dd')}`;
          break;

        case 'adjuster-profiles':
          data = adjusters.map((a: any) => ({
            'Name': a.name,
            'Carrier': a.carrier,
            'Region': a.region || 'N/A',
            'Phone': a.phone || 'N/A',
            'Email': a.email || 'N/A',
            'Risk Impression': a.riskImpression || 'Not assessed',
            'What Worked': a.whatWorked || '',
            'Notes': a.internalNotes || '',
          }));
          filename = `adjuster-profiles-${format(new Date(), 'yyyy-MM-dd')}`;
          break;

        case 'carrier-analysis':
          const carriers = Array.from(new Set(adjusters.map((a: any) => a.carrier?.trim()).filter(Boolean)));
          data = carriers.map(carrier => {
            const carrierAdjusters = adjusters.filter((a: any) => a.carrier?.trim() === carrier);
            const carrierClaims = claims.filter((c: any) => c.carrier?.trim() === carrier);
            return {
              'Carrier': carrier,
              'Total Adjusters': carrierAdjusters.length,
              'Total Claims': carrierClaims.length,
              'Open Claims': carrierClaims.filter((c: any) => c.status === 'open').length,
              'Resolved Claims': carrierClaims.filter((c: any) => c.status === 'resolved').length,
              'High Risk Adjusters': carrierAdjusters.filter((a: any) => a.riskImpression?.toLowerCase().includes('high')).length,
            };
          });
          filename = `carrier-analysis-${format(new Date(), 'yyyy-MM-dd')}`;
          break;

        case 'interaction-history':
          const interactions: any[] = [];
          for (const adj of adjusters) {
            const res = await authFetch(`/api/adjusters/${adj.id}`);
            const fullAdj = await res.json();
            if (fullAdj.interactions) {
              for (const int of fullAdj.interactions) {
                interactions.push({
                  'Date': int.date,
                  'Adjuster': adj.name,
                  'Carrier': adj.carrier,
                  'Type': int.type,
                  'Description': int.description,
                  'Outcome': int.outcome || '',
                  'Claim ID': int.claimId || 'N/A',
                });
              }
            }
          }
          data = interactions.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());
          filename = `interaction-history-${format(new Date(), 'yyyy-MM-dd')}`;
          break;
      }

      if (exportFormat === 'csv') {
        const headers = Object.keys(data[0] || {});
        const csvContent = [
          headers.join(','),
          ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (exportFormat === 'json') {
        const jsonContent = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (exportFormat === 'print') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          const headers = Object.keys(data[0] || {});
          printWindow.document.write(`
            <html>
              <head>
                <title>${filename}</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; }
                  h1 { color: #333; }
                  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                  th { background-color: #f4f4f4; }
                  tr:nth-child(even) { background-color: #f9f9f9; }
                </style>
              </head>
              <body>
                <h1>${reportTypes.find(r => r.type === selectedReport)?.name}</h1>
                <p>Generated: ${format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
                <table>
                  <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                  <tbody>${data.map(row => `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Reports</h1>
            <p className="text-muted-foreground">Generate and export claim intelligence reports</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Report Type</CardTitle>
              <CardDescription>Choose a report to generate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {reportTypes.map((report) => (
                <div
                  key={report.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedReport === report.type 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedReport(report.type)}
                  data-testid={`report-type-${report.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${selectedReport === report.type ? 'bg-primary/10 text-primary' : 'bg-muted'}`}>
                      {report.icon}
                    </div>
                    <div>
                      <h4 className="font-medium">{report.name}</h4>
                      <p className="text-sm text-muted-foreground">{report.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
              <CardDescription>Configure and generate your report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Export Format</label>
                <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
                  <SelectTrigger data-testid="select-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        CSV Spreadsheet
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="w-4 h-4" />
                        JSON Data
                      </div>
                    </SelectItem>
                    <SelectItem value="print">
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4" />
                        Print Preview
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedReport && (
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Report Preview</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {selectedReport === 'claims-summary' && (
                      <p>{claims.length} claims will be included</p>
                    )}
                    {selectedReport === 'adjuster-profiles' && (
                      <p>{adjusters.length} adjuster profiles will be included</p>
                    )}
                    {selectedReport === 'carrier-analysis' && (
                      <p>{Array.from(new Set(adjusters.map((a: any) => a.carrier?.trim()).filter(Boolean))).length} carriers will be analyzed</p>
                    )}
                    {selectedReport === 'interaction-history' && (
                      <p>All interactions across {adjusters.length} adjusters</p>
                    )}
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                disabled={!selectedReport || generating}
                onClick={generateReport}
                data-testid="button-generate-report"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Data that will be included in reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-3xl font-bold">{adjusters.length}</p>
                <p className="text-sm text-muted-foreground">Adjusters</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-3xl font-bold">{claims.length}</p>
                <p className="text-sm text-muted-foreground">Claims</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-3xl font-bold">
                  {Array.from(new Set(adjusters.map((a: any) => a.carrier?.trim()).filter(Boolean))).length}
                </p>
                <p className="text-sm text-muted-foreground">Carriers</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-3xl font-bold">
                  {claims.filter((c: any) => c.status === 'open').length}
                </p>
                <p className="text-sm text-muted-foreground">Open Claims</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
