"use client";
import Image from "next/image";
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
  onKeepBoth,
  onSkip,
  onReplaceExisting,
}) => {
  const newFileUrl = URL.createObjectURL(file);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSkip(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate photo detected</DialogTitle>
          <DialogDescription>
            {similarityLabel(duplicate.distance)} — &quot;{file.name}&quot; looks like an
            existing photo in your library.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 my-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              New photo
            </span>
            <div className="relative w-full aspect-square rounded-md overflow-hidden bg-muted">
              <Image
                unoptimized
                src={newFileUrl}
                alt="New photo"
                fill
                className="object-cover"
              />
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {file.name}
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Existing photo
            </span>
            <div className="relative w-full aspect-square rounded-md overflow-hidden bg-muted">
              {duplicate.thumbnailUrl ? (
                <Image
                  unoptimized
                  src={duplicate.thumbnailUrl}
                  alt="Existing photo"
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No preview
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-full px-1">
              {duplicate.filename}
            </span>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
          <Button variant="outline" onClick={onKeepBoth}>
            Keep both
          </Button>
          <Button variant="destructive" onClick={onReplaceExisting}>
            Replace existing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateUploadModal;
