"use client";
import { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import type { DuplicatePhoto } from "@/app/lib/services/s3.service";

interface DuplicateUploadModalProps {
  file: File;
  duplicate: DuplicatePhoto;
  previewSrc?: string;
  onKeepBoth: () => void;
  onSkip: () => void;
  onReplaceExisting: () => void;
}

function similarityLabel(distance: number): string {
  if (distance === 0) return "Exact duplicate";
  if (distance <= 3) return "Very similar";
  return "Possibly similar";
}

const DuplicateUploadModal: React.FC<DuplicateUploadModalProps> = ({
  file,
  duplicate,
  previewSrc,
  onKeepBoth,
  onSkip,
  onReplaceExisting,
}) => {
  const fallbackFileUrl = useMemo(
    () => (previewSrc ? null : URL.createObjectURL(file)),
    [file, previewSrc],
  );
  const newFileUrl = previewSrc ?? fallbackFileUrl;

  useEffect(() => {
    if (!fallbackFileUrl) return;
    return () => URL.revokeObjectURL(fallbackFileUrl);
  }, [fallbackFileUrl]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSkip(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate photo detected</DialogTitle>
          <DialogDescription>
            {similarityLabel(duplicate.distance)} — &quot;{file.name}&quot; looks like an
            existing photo in your library.
            Click the photo you want to keep, or keep both.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 my-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Existing photo
            </span>
            <button
              type="button"
              className="relative w-full aspect-square cursor-pointer overflow-hidden rounded-md bg-muted transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onSkip}
            >
              {duplicate.thumbnailUrl ? (
                <img
                  src={duplicate.thumbnailUrl}
                  alt="Existing photo"
                  className="h-full w-full cursor-pointer object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No preview
                </div>
              )}
            </button>
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {duplicate.filename}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              New photo
            </span>
            <button
              type="button"
              className="relative w-full aspect-square cursor-pointer overflow-hidden rounded-md bg-muted transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onReplaceExisting}
            >
              {newFileUrl ? (
                <img
                  src={newFileUrl}
                  alt="New photo"
                  className="h-full w-full cursor-pointer object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No preview
                </div>
              )}
            </button>
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {file.name}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onKeepBoth}>
            Keep both
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateUploadModal;
