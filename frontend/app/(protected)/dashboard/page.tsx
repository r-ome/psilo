"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Trash2, Upload } from "lucide-react";
import FileDropZone from "@/app/(protected)/components/FileDropZone";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import ImageViewer from "@/app/(protected)/components/ImageViewer";
import { photoService, Photo } from "@/app/lib/services/photo.service";

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoToDelete, setPhotoToDelete] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const totalSizeMB = useMemo(() => {
    const bytes = photos.reduce((sum, p) => sum + (p.size ?? 0), 0);
    return (bytes / (1024 * 1024)).toFixed(2);
  }, [photos]);

  const photosCount = useMemo(() => {
    const photo = photos.filter(
      (item) => item.contentType && item.contentType.includes("image"),
    ).length;
    const video = photos.filter(
      (item) => item.contentType && item.contentType.includes("video"),
    ).length;
    return { photo, video };
  }, [photos]);

  const loadPhotos = useCallback(() => {
    photoService
      .listPhotos()
      .then(setPhotos)
      .catch(() => {});
  }, []);

  useEffect(() => {
    photoService
      .listPhotos()
      .then(setPhotos)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hasInProgress = photos.some(
      (p) => p.status === "pending" || p.status === "processing",
    );
    if (!hasInProgress) return;
    const id = setInterval(() => {
      photoService
        .listPhotos()
        .then(setPhotos)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [photos]);

  const handleUploadComplete = useCallback(() => {
    setUploadDialogOpen(false);
    setTimeout(loadPhotos, 2000);
  }, [loadPhotos]);

  const handleToggleSelect = (photo: Photo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!photoToDelete) return;
    const key = photoToDelete.s3Key;
    setPhotoToDelete(null);
    try {
      await photoService.deletePhoto(key);
      setPhotos((prev) => prev.filter((p) => p.s3Key !== key));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(photoToDelete.id);
        return next;
      });
    } catch {
      // ignore
    }
  };

  const handleRetry = async (photo: Photo) => {
    try {
      await photoService.deletePhoto(photo.s3Key);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch {
      // ignore
    }
    setUploadDialogOpen(true);
  };

  const handleBulkDeleteConfirm = async () => {
    const toDelete = photos.filter((p) => selectedIds.has(p.id));
    setBulkDeletePending(false);
    setSelectedIds(new Set());
    try {
      await Promise.all(toDelete.map((p) => photoService.deletePhoto(p.s3Key)));
      setPhotos((prev) =>
        prev.filter((p) => !toDelete.some((d) => d.id === p.id)),
      );
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Your Files</DialogTitle>
            </DialogHeader>
            <FileDropZone onUploadComplete={handleUploadComplete} />
          </DialogContent>
        </Dialog>

        <div className="text-sm text-muted-foreground font-semibold">
          {photosCount.video} video{photosCount.video !== 1 ? "s" : ""} ·{" "}
          {photosCount.photo} photo{photosCount.photo !== 1 ? "s" : ""} ·{" "}
          {totalSizeMB} MB
        </div>
      </div>

      {photos.length > 0 && (
        <div>
          <div className="flex items-center justify-end mb-4">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeletePending(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete selected
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
          <PhotoGrid
            photos={photos}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDeleteRequest={setPhotoToDelete}
            onPhotoClick={setViewerIndex}
            onRetry={handleRetry}
          />
        </div>
      )}

      <DeleteConfirmDialog
        photo={photoToDelete}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPhotoToDelete(null)}
      />
      <DeleteConfirmDialog
        bulkCount={bulkDeletePending ? selectedIds.size : null}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setBulkDeletePending(false)}
      />
      <ImageViewer
        photos={photos}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
