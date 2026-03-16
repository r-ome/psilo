"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Photo } from "@/app/lib/services/photo.service";
import {
  downloadService,
  GlacierTier,
} from "@/app/lib/services/download.service";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: Photo[];
}

const TIERS: {
  id: GlacierTier;
  label: string;
  speed: string;
  cost: string;
}[] = [
  {
    id: "Expedited",
    label: "Expedited",
    speed: "1–5 minutes",
    cost: "$0.03/GB + $0.01/1,000 requests",
  },
  {
    id: "Standard",
    label: "Standard",
    speed: "3–5 hours",
    cost: "$0.01/GB + $0.05/1,000 requests",
  },
  {
    id: "Bulk",
    label: "Bulk",
    speed: "5–12 hours",
    cost: "$0.025/1,000 requests",
  },
];

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const ACTIVE_STATUS_LABEL: Record<string, string> = {
  PENDING:         "restore pending",
  IN_PROGRESS:     "restore in progress",
  ZIPPING:         "being zipped",
  COMPLETED:       "ready to download",
  PARTIAL_FAILURE: "partially ready",
  AVAILABLE:       "available",
  PARTIAL:         "partially available",
};

export default function DownloadModal({
  isOpen,
  onClose,
  photos,
}: DownloadModalProps) {
  const [selectedTier, setSelectedTier] = useState<GlacierTier>("Standard");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasAlreadyActive, setHasAlreadyActive] = useState(false);

  const standardPhotos = photos.filter((p) => p.storageClass === "STANDARD");
  const glacierPhotos = photos.filter((p) => p.storageClass === "GLACIER");
  const hasGlacier = glacierPhotos.length > 0;

  const handleClose = () => {
    setMessage(null);
    setLoading(false);
    setHasAlreadyActive(false);
    onClose();
  };

  const handleDownload = async () => {
    setLoading(true);
    setMessage(null);
    setHasAlreadyActive(false);
    try {
      const keys = photos.map((p) => p.s3Key);
      const result = await downloadService.requestDownload(
        keys,
        hasGlacier ? selectedTier : undefined,
      );

      // Trigger immediate downloads for standard photos
      result.standardUrls.forEach(({ url, key }, i) => {
        const photo = photos.find((p) => p.s3Key === key);
        const filename = photo?.filename ?? key.split("/").pop() ?? "download";
        setTimeout(() => triggerDownload(url, filename), i * 50);
      });

      const active = result.alreadyActive ?? [];
      const newGlacierInitiated = result.glacierInitiated;

      if (active.length > 0) {
        setHasAlreadyActive(true);
        // Group active restores by status for a concise summary
        const readyCount = active.filter(
          (r) => r.batchStatus === "COMPLETED" || r.batchStatus === "AVAILABLE",
        ).length;
        const inProgressCount = active.length - readyCount;

        const parts: string[] = [];
        if (readyCount > 0)
          parts.push(
            `${readyCount} photo${readyCount !== 1 ? "s are" : " is"} already ready to download`,
          );
        if (inProgressCount > 0)
          parts.push(
            `${inProgressCount} photo${inProgressCount !== 1 ? "s have" : " has"} a restore already in progress`,
          );

        const summary = parts.join(" and ") + ".";
        setMessage(
          newGlacierInitiated
            ? `${summary} A new restore was started for the remaining photos.`
            : summary,
        );
      } else if (result.glacierAlreadyInProgress) {
        setMessage(
          "Restore already in progress — you'll receive an email when your Glacier photos are ready.",
        );
      } else if (newGlacierInitiated) {
        setMessage(
          "Restore started — you'll receive an email when your Glacier photos are ready.",
        );
      } else {
        handleClose();
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download Photos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {standardPhotos.length > 0 && glacierPhotos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {standardPhotos.length} photo
              {standardPhotos.length !== 1 ? "s" : ""} will download
              immediately. {glacierPhotos.length} photo
              {glacierPhotos.length !== 1 ? "s are" : " is"} archived in
              Glacier and need to be restored first.
            </p>
          )}
          {standardPhotos.length === 0 && glacierPhotos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {glacierPhotos.length} photo
              {glacierPhotos.length !== 1 ? "s are" : " is"} archived in
              Glacier. Select a restore tier:
            </p>
          )}
          {standardPhotos.length > 0 && glacierPhotos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {standardPhotos.length} photo
              {standardPhotos.length !== 1 ? "s" : ""} ready to download.
            </p>
          )}

          {hasGlacier && (
            <div className="space-y-2">
              {TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedTier(tier.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedTier === tier.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{tier.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {tier.speed}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tier.cost}
                  </p>
                </button>
              ))}
            </div>
          )}

          {message && (
            <div className="bg-muted rounded-md p-3 space-y-1.5">
              <p className="text-sm text-muted-foreground">{message}</p>
              {hasAlreadyActive && (
                <Link
                  href="/restore-requests"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={handleClose}
                >
                  View restore requests →
                </Link>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {message ? "Close" : "Cancel"}
          </Button>
          {!message && (
            <Button onClick={handleDownload} disabled={loading}>
              {loading && <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />}
              {hasGlacier ? "Request Restore" : "Download"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
