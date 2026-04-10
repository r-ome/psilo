"use client";
import { useEffect, useMemo, useState } from "react";
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
  onResolve: (
    action: "keepBoth" | "skip" | "replace",
    applyToRest: boolean,
  ) => void;
}

function similarityLabel(distance: number): string {
  if (distance === 0) return "Exact duplicate";
  if (distance <= 3) return "Very similar";
  return "Possibly similar";
}

function NewPhotoPreview({
  candidates,
  file,
}: {
  candidates: string[];
  file: File;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showNoPreview, setShowNoPreview] = useState(candidates.length === 0);
  const isVideo = file.type.startsWith("video/");

  if (showNoPreview || candidates.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        No preview
      </div>
    );
  }

  const activeSrc = candidates[activeIndex];
  if (!activeSrc) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        No preview
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={activeSrc}
        aria-label="New video"
        className="h-full w-full cursor-pointer object-cover"
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={activeSrc}
      alt="New photo"
      className="h-full w-full cursor-pointer object-cover"
      onError={() => {
        const nextIndex = activeIndex + 1;
        if (nextIndex < candidates.length) {
          setActiveIndex(nextIndex);
          return;
        }
        setShowNoPreview(true);
      }}
    />
  );
}

const DuplicateUploadModal: React.FC<DuplicateUploadModalProps> = ({
  file,
  duplicate,
  previewSrc,
  onResolve,
}) => {
  const normalizedPreviewSrc = previewSrc?.trim();
  const isDataImagePreview =
    !!normalizedPreviewSrc && normalizedPreviewSrc.startsWith("data:image/");
  const usePreviewSrc =
    !!normalizedPreviewSrc && !isDataImagePreview;
  const fallbackFileUrl = useMemo(
    () => (usePreviewSrc ? null : URL.createObjectURL(file)),
    [file, usePreviewSrc],
  );
  const [fullResFileDataUrl, setFullResFileDataUrl] = useState<string | null>(null);
  const preferredNewFileUrl = usePreviewSrc
    ? normalizedPreviewSrc ?? null
    : fallbackFileUrl;
  const secondaryNewFileUrl = fullResFileDataUrl;
  const tertiaryNewFileUrl = isDataImagePreview ? normalizedPreviewSrc ?? null : null;
  const newPhotoPreviewCandidates = useMemo(() => {
    const candidates = [
      preferredNewFileUrl,
      secondaryNewFileUrl,
      tertiaryNewFileUrl,
    ].filter((value): value is string => !!value);
    return [...new Set(candidates)];
  }, [preferredNewFileUrl, secondaryNewFileUrl, tertiaryNewFileUrl]);
  const [applyToRest, setApplyToRest] = useState(false);

  useEffect(() => {
    if (!fallbackFileUrl) return;
    return () => URL.revokeObjectURL(fallbackFileUrl);
  }, [fallbackFileUrl]);

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (!active) return;
      const result = typeof reader.result === "string" ? reader.result : null;
      setFullResFileDataUrl(result);
    };
    reader.onerror = () => {
      if (!active) return;
      setFullResFileDataUrl(null);
    };
    reader.readAsDataURL(file);

    return () => {
      active = false;
      reader.abort();
    };
  }, [file]);

  const handleResolve = (action: "keepBoth" | "skip" | "replace") => {
    onResolve(action, applyToRest);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onResolve("skip", false); }}>
      <DialogContent className="w-[min(42rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Duplicate {file.type.startsWith("video/") ? "video" : "photo"} detected</DialogTitle>
          <DialogDescription>
            {similarityLabel(duplicate.distance)} — &quot;{file.name}&quot; looks like an
            existing item in your library.
            Click the item you want to keep, or keep both.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 my-4 sm:grid-cols-2">
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Existing item
            </span>
            <button
              type="button"
              className="relative w-full aspect-square cursor-pointer overflow-hidden rounded-md bg-muted transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => handleResolve("skip")}
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
              New {file.type.startsWith("video/") ? "video" : "photo"}
            </span>
            <button
              type="button"
              className="relative w-full min-h-[16rem] aspect-square cursor-pointer overflow-hidden rounded-md bg-muted transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => handleResolve("replace")}
            >
              <NewPhotoPreview
                key={`${file.name}-${file.size}-${file.lastModified}-${normalizedPreviewSrc ?? ""}`}
                candidates={newPhotoPreviewCandidates}
                file={file}
              />
            </button>
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {file.name}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={applyToRest}
              onChange={(event) => setApplyToRest(event.target.checked)}
            />
            Do this for the rest of files
          </label>
          <Button variant="outline" onClick={() => handleResolve("keepBoth")}>
            Keep both
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateUploadModal;
