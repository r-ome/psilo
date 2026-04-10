"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import { Button } from "@/app/components/ui/button";
import { useUpload } from "@/app/context/UploadContext";
import { formatDuration } from "@/app/lib/utils";

type Phase = "idle" | "uploading" | "done";

export function UploadProgressIndicator() {
  const {
    isUploading,
    totalFiles,
    completedFiles,
    activeUploads,
    activeUploadNames,
    currentFileName,
    fileSizes,
    fileProgresses,
    uploadStartedAt,
    failedUploads,
    retryUpload,
    retryFailedUploads,
  } = useUpload();

  const [phase, setPhase] = useState<Phase>("idle");
  const [minimized, setMinimized] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const overallProgress =
    totalFiles > 0
      ? Object.values(fileProgresses).reduce((sum, progress) => sum + progress, 0) /
        totalFiles
      : 0;
  const overallPercent =
    totalFiles > 0 ? Math.round(overallProgress) : 0;
  const filePercent =
    totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
  const activeLabel =
    activeUploads > 1
      ? `${activeUploads} files uploading`
      : activeUploads === 1
        ? Object.values(activeUploadNames)[0] ?? currentFileName
        : null;
  const etaLabel = (() => {
    if (!isUploading || activeUploads === 0 || uploadStartedAt == null) {
      return null;
    }

    const totalBytes = Object.values(fileSizes).reduce((sum, size) => sum + size, 0);
    if (totalBytes <= 0) {
      return null;
    }

    const remainingBytes = Object.entries(fileSizes).reduce((sum, [itemId, size]) => {
      const progress = Math.max(0, Math.min(fileProgresses[itemId] ?? 0, 100));
      return sum + size * (1 - progress / 100);
    }, 0);

    const completedBytes = totalBytes - remainingBytes;
    const elapsedSeconds = Math.max((now - uploadStartedAt) / 1000, 1);

    if (completedBytes < 5 * 1024 * 1024 && elapsedSeconds < 10) {
      return "Estimating time remaining...";
    }

    const bytesPerSecond = completedBytes / elapsedSeconds;
    if (bytesPerSecond <= 0) {
      return "Estimating time remaining...";
    }

    const etaSeconds = remainingBytes / bytesPerSecond;
    if (!Number.isFinite(etaSeconds) || etaSeconds < 0) {
      return "Estimating time remaining...";
    }

    return `About ${formatDuration(etaSeconds)} left`;
  })();
  const uploadingCount = Math.min(completedFiles + activeUploads, totalFiles);

  useEffect(() => {
    if (!isUploading || phase !== "uploading") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isUploading, phase]);

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
    if (phase !== "done" || failedUploads.length > 0) return;
    const timer = setTimeout(() => setPhase("idle"), 3000);
    return () => clearTimeout(timer);
  }, [failedUploads.length, phase]);

  if (phase === "idle") return null;

  if (phase === "done") {
    if (failedUploads.length > 0) {
      return (
        <Card className="fixed bottom-4 right-4 z-50 w-80 p-4 shadow-lg">
          <div className="mb-1 text-sm font-medium">Upload finished with issues</div>
          <p className="mb-3 text-xs text-muted-foreground">
            {failedUploads.length} file{failedUploads.length > 1 ? "s" : ""} failed. Retry
            failed upload{failedUploads.length > 1 ? "s" : ""} below.
          </p>
          <div className="mb-3 flex flex-col gap-2">
            {failedUploads.slice(0, 3).map((failedUpload) => (
              <div
                key={failedUpload.itemId}
                className="rounded-md border border-border bg-muted/30 p-2"
              >
                <div className="truncate text-xs font-medium">{failedUpload.filename}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {failedUpload.errorMessage}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Attempt {failedUpload.attempts}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => retryUpload(failedUpload.itemId)}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {failedUploads.length > 3 && (
            <p className="mb-2 text-xs text-muted-foreground">
              +{failedUploads.length - 3} more failed file
              {failedUploads.length - 3 > 1 ? "s" : ""}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
              Dismiss
            </Button>
            <Button size="sm" onClick={retryFailedUploads}>
              Retry all
            </Button>
          </div>
        </Card>
      );
    }

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
            Uploading {uploadingCount} of {totalFiles} files
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {filePercent}% files
            </span>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
        <div className="px-3 pb-3">
          <Progress value={overallPercent} />
          {etaLabel && (
            <p className="mt-2 text-xs text-muted-foreground">{etaLabel}</p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-72 p-4 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          Uploading {uploadingCount} of {totalFiles} files
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {filePercent}% files
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
      {etaLabel && (
        <p className="mb-2 text-xs text-muted-foreground">{etaLabel}</p>
      )}
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Transfer progress</span>
        <span>{overallPercent}%</span>
      </div>
      <Progress value={overallPercent} />
    </Card>
  );
}
