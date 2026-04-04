"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import { Button } from "@/app/components/ui/button";
import { useUpload } from "@/app/context/UploadContext";

type Phase = "idle" | "uploading" | "done";

export function UploadProgressIndicator() {
  const {
    isUploading,
    totalFiles,
    completedFiles,
    activeUploads,
    currentFileName,
    fileProgresses,
  } = useUpload();

  const [phase, setPhase] = useState<Phase>("idle");
  const [minimized, setMinimized] = useState(false);

  const overallProgress =
    totalFiles > 0
      ? Object.values(fileProgresses).reduce((sum, progress) => sum + progress, 0) /
        totalFiles
      : 0;
  const overallPercent =
    totalFiles > 0 ? Math.round(overallProgress) : 0;
  const activeLabel =
    activeUploads > 1
      ? `${activeUploads} files uploading`
      : activeUploads === 1
        ? currentFileName
        : null;
  const uploadingCount = Math.min(completedFiles + activeUploads, totalFiles);

  // Transition: idle → uploading when upload starts
  if (isUploading && phase !== "uploading") {
    setPhase("uploading");
    setMinimized(false);
  }

  // Transition: uploading → done when upload finishes
  if (!isUploading && phase === "uploading") {
    setPhase("done");
    setMinimized(false);
  }

  // Auto-dismiss done state after 3 seconds
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => setPhase("idle"), 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "idle") return null;

  if (phase === "done") {
    return (
      <Card className="fixed bottom-4 right-4 z-50 w-72 p-4 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-green-500/10 p-1">
            <Check className="h-4 w-4 text-green-500" />
          </div>
          <span className="text-sm font-medium">Upload complete</span>
        </div>
      </Card>
    );
  }

  if (minimized) {
    return (
      <Card className="fixed bottom-4 right-4 z-50 w-72 shadow-lg">
        <button
          onClick={() => setMinimized(false)}
          className="flex w-full items-center justify-between p-3"
        >
          <span className="text-sm font-medium">
            Uploading {uploadingCount} of {totalFiles}
          </span>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="px-3 pb-3">
          <Progress value={overallPercent} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-72 p-4 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          Uploading {uploadingCount} of {totalFiles}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {overallPercent}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMinimized(true)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {activeLabel && (
        <p className="text-xs text-muted-foreground truncate mb-2">
          {activeLabel}
        </p>
      )}
      <Progress value={overallPercent} />
    </Card>
  );
}
