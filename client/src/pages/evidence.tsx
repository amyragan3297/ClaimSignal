import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAccessToken } from "@/lib/queryClient";
import type {
  EvidenceFile,
  ExtractedEntity,
  ClaimDraft,
  Claim,
} from "@shared/schema";
import {
  Upload,
  FileUp,
  FileText,
  CheckCircle,
  AlertTriangle,
  Search,
  X,
  Loader2,
  ChevronDown,
  Link as LinkIcon,
} from "lucide-react";

const ACCEPTED_TYPES =
  ".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.docx,.txt,.eml";
const ACCEPTED_MIME =
  "application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,message/rfc822";

const categoryColors: Record<string, string> = {
  denial_letter: "destructive",
  estimate: "secondary",
  scope: "secondary",
  payment_letter: "default",
  supplement: "default",
  invoice: "outline",
  photo_report: "outline",
  policy: "secondary",
  email_thread: "outline",
  unknown: "outline",
};

function formatEntityType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadResult {
  file: EvidenceFile;
  entities: ExtractedEntity[];
  matchedClaimId: string | null;
  draft: ClaimDraft | null;
}

export default function EvidencePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [matchingFileId, setMatchingFileId] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [preSelectClaimId, setPreSelectClaimId] = useState<string>("");

  const { data: evidenceFiles, isLoading: filesLoading } = useQuery<
    (EvidenceFile & { entities?: ExtractedEntity[] })[]
  >({
    queryKey: ["/api/evidence/files"],
  });

  const { data: claims } = useQuery<Claim[]>({
    queryKey: ["/api/claims"],
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery<ClaimDraft[]>({
    queryKey: ["/api/evidence/drafts"],
  });

  const selectedFile = evidenceFiles?.find((f) => f.id === selectedFileId);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadResult(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (preSelectClaimId)
          formData.append("claimId", preSelectClaimId);

        const token = getAccessToken();
        const res = await fetch("/api/evidence/upload", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
          credentials: "include",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }

        const result: UploadResult = await res.json();
        setUploadResult(result);
        queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/evidence/drafts"] });
        toast({ title: "File uploaded successfully" });
      } catch (err: any) {
        toast({
          title: "Upload failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [preSelectClaimId, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleUpload(files[0]);
    },
    [handleUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) handleUpload(files[0]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleUpload]
  );

  const matchMutation = useMutation({
    mutationFn: async ({
      fileId,
      claimId,
    }: {
      fileId: string;
      claimId: string;
    }) => {
      await apiRequest("POST", `/api/evidence/files/${fileId}/match`, {
        claimId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evidence/files"] });
      toast({ title: "Claim matched successfully" });
      setMatchDialogOpen(false);
      setSelectedClaimId("");
      setMatchingFileId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Match failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          data-testid="text-evidence-title"
        >
          Evidence Upload
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload documents to the ClaimSignal™ intelligence pipeline
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">
            Pre-select claim:
          </label>
          <Select
            value={preSelectClaimId}
            onValueChange={setPreSelectClaimId}
          >
            <SelectTrigger
              className="w-[200px]"
              data-testid="select-preselect-claim"
            >
              <SelectValue placeholder="None (auto-match)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (auto-match)</SelectItem>
              {claims?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.claimNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-md p-12 text-center transition-colors ${
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            data-testid="dropzone-upload"
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm font-medium">Processing document...</p>
                <p className="text-xs text-muted-foreground">
                  Classifying, extracting entities, and matching claims
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <FileUp className="w-10 h-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Drag & drop files here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, Images, DOCX, TXT, EML
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-browse-files"
                >
                  <Upload className="w-4 h-4" />
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-file-upload"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Classification
                </p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      (categoryColors[
                        uploadResult.file.docCategory || "unknown"
                      ] as any) || "outline"
                    }
                    data-testid="badge-upload-category"
                  >
                    {formatCategory(
                      uploadResult.file.docCategory || "unknown"
                    )}
                  </Badge>
                  {uploadResult.file.confidence != null && (
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="text-upload-confidence"
                    >
                      {(uploadResult.file.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Claim Match
                </p>
                {uploadResult.matchedClaimId ? (
                  <span
                    className="text-sm font-mono"
                    data-testid="text-upload-claim-match"
                  >
                    {uploadResult.matchedClaimId}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" data-testid="badge-needs-review">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Needs Review
                    </Badge>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Entities Extracted
                </p>
                <span
                  className="text-sm"
                  data-testid="text-upload-entity-count"
                >
                  {uploadResult.entities?.length || 0} found
                </span>
              </div>
            </div>
            {uploadResult.entities && uploadResult.entities.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Extracted Entities
                </p>
                <div className="space-y-1">
                  {uploadResult.entities.map((entity, i) => (
                    <div
                      key={entity.id || i}
                      className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0"
                      data-testid={`row-upload-entity-${i}`}
                    >
                      <span className="text-muted-foreground">
                        {formatEntityType(entity.entityType)}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs">
                          {entity.rawValue}
                        </span>
                        {entity.confidence != null && (
                          <span className="text-xs text-muted-foreground">
                            {(entity.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence Files</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filesLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !evidenceFiles?.length ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                No evidence files yet
              </p>
              <p className="text-sm text-muted-foreground/70">
                Upload your first document above
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Claim Match</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidenceFiles.map((file) => (
                    <TableRow
                      key={file.id}
                      className="hover-elevate cursor-pointer"
                      onClick={() =>
                        setSelectedFileId(
                          selectedFileId === file.id ? null : file.id
                        )
                      }
                      data-testid={`row-evidence-${file.id}`}
                    >
                      <TableCell className="font-medium text-sm max-w-[200px] truncate" data-testid={`text-filename-${file.id}`}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          {file.fileName}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground uppercase" data-testid={`text-filetype-${file.id}`}>
                        {file.fileType || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            (categoryColors[
                              file.docCategory || "unknown"
                            ] as any) || "outline"
                          }
                          className="text-xs"
                          data-testid={`badge-category-${file.id}`}
                        >
                          {formatCategory(file.docCategory || "unknown")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-claim-match-${file.id}`}>
                        {file.claimId ? (
                          <span className="font-mono text-xs">
                            {file.claimId.slice(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            file.extractionStatus === "complete"
                              ? "default"
                              : file.extractionStatus === "failed"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-xs capitalize"
                          data-testid={`badge-status-${file.id}`}
                        >
                          {file.extractionStatus || "pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`text-uploaded-${file.id}`}>
                        {file.uploadedAt
                          ? new Date(file.uploadedAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedFile && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">File Details</CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelectedFileId(null)}
              data-testid="button-close-detail"
            >
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium truncate" data-testid="text-detail-name">
                  {selectedFile.fileName}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm uppercase" data-testid="text-detail-type">
                  {selectedFile.fileType || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Size</p>
                <p className="text-sm" data-testid="text-detail-size">
                  {formatFileSize(selectedFile.fileSize)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SHA-256</p>
                <p
                  className="text-xs font-mono truncate"
                  title={selectedFile.sha256 || ""}
                  data-testid="text-detail-sha256"
                >
                  {selectedFile.sha256
                    ? selectedFile.sha256.slice(0, 16) + "..."
                    : "—"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Classification
              </p>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    (categoryColors[
                      selectedFile.docCategory || "unknown"
                    ] as any) || "outline"
                  }
                  data-testid="badge-detail-category"
                >
                  {formatCategory(selectedFile.docCategory || "unknown")}
                </Badge>
                {selectedFile.confidence != null && (
                  <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${(selectedFile.confidence * 100).toFixed(0)}%`,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="text-detail-confidence"
                    >
                      {(selectedFile.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {(selectedFile as any).entities &&
              (selectedFile as any).entities.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Extracted Entities
                  </p>
                  <div className="space-y-2">
                    {((selectedFile as any).entities as ExtractedEntity[]).map(
                      (entity, i) => (
                        <div
                          key={entity.id || i}
                          className="flex items-center gap-3 text-sm"
                          data-testid={`row-detail-entity-${i}`}
                        >
                          <span className="text-muted-foreground min-w-[140px]">
                            {formatEntityType(entity.entityType)}
                          </span>
                          <span className="font-mono text-xs flex-1 truncate">
                            {entity.rawValue}
                          </span>
                          {entity.confidence != null && (
                            <div className="flex items-center gap-1 min-w-[80px]">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full"
                                  style={{
                                    width: `${(entity.confidence * 100).toFixed(0)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {(entity.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

            {!selectedFile.claimId && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMatchingFileId(selectedFile.id);
                    setMatchDialogOpen(true);
                  }}
                  data-testid="button-match-claim"
                >
                  <LinkIcon className="w-4 h-4" />
                  Match to Claim
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Collapsible open={draftsOpen} onOpenChange={setDraftsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Claim Drafts</CardTitle>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ${
                  draftsOpen ? "rotate-180" : ""
                }`}
              />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {draftsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !drafts?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No drafts needing review
                </p>
              ) : (
                <div className="space-y-3">
                  {drafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="border border-border rounded-md p-3 space-y-2"
                      data-testid={`card-draft-${draft.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-draft-claim-number-${draft.id}`}>
                          {draft.extractedClaimNumber || "No claim number"}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs capitalize"
                          data-testid={`badge-draft-status-${draft.id}`}
                        >
                          {draft.status?.replace("_", " ") || "Needs Review"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        {draft.extractedInsured && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Insured
                            </span>
                            <span data-testid={`text-draft-insured-${draft.id}`}>{draft.extractedInsured}</span>
                          </div>
                        )}
                        {draft.extractedCarrier && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Carrier
                            </span>
                            <span data-testid={`text-draft-carrier-${draft.id}`}>{draft.extractedCarrier}</span>
                          </div>
                        )}
                        {draft.extractedAddress && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Address
                            </span>
                            <span data-testid={`text-draft-address-${draft.id}`}>{draft.extractedAddress}</span>
                          </div>
                        )}
                        {draft.extractedDateOfLoss && (
                          <div>
                            <span className="block text-muted-foreground/70">
                              Date of Loss
                            </span>
                            <span data-testid={`text-draft-dol-${draft.id}`}>
                              {new Date(
                                draft.extractedDateOfLoss
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Match to Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={selectedClaimId}
              onValueChange={setSelectedClaimId}
            >
              <SelectTrigger data-testid="select-match-claim">
                <SelectValue placeholder="Select a claim" />
              </SelectTrigger>
              <SelectContent>
                {claims?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.claimNumber}
                    {c.carrier ? ` — ${c.carrier}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setMatchDialogOpen(false)}
                data-testid="button-cancel-match"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !selectedClaimId || matchMutation.isPending
                }
                onClick={() => {
                  if (matchingFileId && selectedClaimId) {
                    matchMutation.mutate({
                      fileId: matchingFileId,
                      claimId: selectedClaimId,
                    });
                  }
                }}
                data-testid="button-confirm-match"
              >
                {matchMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Confirm Match
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
