import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Upload, Loader2, FileAudio } from "lucide-react";
import { authFetch } from "@/lib/api";

interface AudioTranscribeProps {
  onTranscript: (text: string) => void;
}

export function AudioTranscribe({ onTranscript }: AudioTranscribeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError("");
    setIsTranscribing(true);
    setTranscript("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const ext = file.name.split(".").pop()?.toLowerCase() || "wav";
      
      const res = await authFetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: base64, format: ext }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to transcribe");
      }

      const data = await res.json();
      setTranscript(data.transcript);
    } catch (err: any) {
      setError(err.message || "Failed to transcribe audio");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleUseTranscript = () => {
    onTranscript(transcript);
    setIsOpen(false);
    setTranscript("");
    setFileName("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-transcribe-audio">
          <Mic className="w-4 h-4 mr-2" />
          Transcribe Recording
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="w-5 h-5" />
            Transcribe Audio Recording
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-audio-file"
            />
            
            {isTranscribing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Transcribing {fileName}...</p>
              </div>
            ) : (
              <div 
                className="cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload an audio file
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports: M4A, MP3, WAV, WebM, OGG
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {transcript && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Transcript</label>
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="min-h-[150px]"
                data-testid="textarea-transcript"
              />
              <Button 
                onClick={handleUseTranscript} 
                className="w-full"
                data-testid="button-use-transcript"
              >
                Use This Transcript
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
