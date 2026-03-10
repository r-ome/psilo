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
import {
  CalendarDays,
  Trash2,
  Upload,
  CheckSquare,
  Square,
} from "lucide-react";
import FileDropZone from "@/app/(protected)/components/FileDropZone";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import UpdateTakenAtDialog from "@/app/(protected)/components/UpdateTakenAtDialog";
import ImageViewer from "@/app/(protected)/components/ImageViewer";
import { photoService, Photo } from "@/app/lib/services/photo.service";

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [photoToUpdate, setPhotoToUpdate] = useState<Photo | null>(null);
  const [bulkUpdatePending, setBulkUpdatePending] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

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
      .then((data) => {
        setPhotos(data.photos);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {});
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    photoService
      .listPhotos(nextCursor)
      .then((data) => {
        setPhotos((prev) => [...prev, ...data.photos]);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  }, [nextCursor]);

  useEffect(() => {
    photoService
      .listPhotos()
      .then((data) => {
        setPhotos(data.photos);
        setNextCursor(data.nextCursor);
      })
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
        .then((data) => {
          setPhotos((prev) => {
            const updated = data.photos.reduce(
              (map, p) => {
                map[p.id] = p;
                return map;
              },
              {} as Record<string, Photo>,
            );
            return prev.map((p) => updated[p.id] ?? p);
          });
        })
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

  const handleUpdateConfirm = async (takenAt: string | null) => {
    if (!photoToUpdate) return;
    const key = photoToUpdate.s3Key;
    setPhotoToUpdate(null);
    try {
      const updated = await photoService.updatePhotoTakenAt(key, takenAt);
      setPhotos((prev) =>
        prev.map((p) =>
          p.s3Key === updated.s3Key ? { ...p, takenAt: updated.takenAt } : p,
        ),
      );
    } catch {
      // ignore
    }
  };

  const handleBulkUpdateConfirm = async (takenAt: string | null) => {
    const toUpdate = photos.filter((p) => selectedIds.has(p.id));
    setBulkUpdatePending(false);
    setSelectedIds(new Set());
    try {
      await Promise.all(
        toUpdate.map((p) => photoService.updatePhotoTakenAt(p.s3Key, takenAt)),
      );
      setPhotos((prev) =>
        prev.map((p) =>
          toUpdate.some((u) => u.id === p.id) ? { ...p, takenAt } : p,
        ),
      );
    } catch {
      // ignore
    }
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

  const handleToggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    if (selectMode) setSelectedIds(new Set());
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
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
          {photos.length > 0 && (
            <Button
              variant={selectMode ? "default" : "outline"}
              size="sm"
              onClick={handleToggleSelectMode}
            >
              {selectMode ? (
                <>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Done
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Select
                </>
              )}
            </Button>
          )}
        </div>

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
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkUpdatePending(true)}
                >
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Update date
                </Button>
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
            selectMode={selectMode}
          />
          {nextCursor && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}

      <UpdateTakenAtDialog
        photo={photoToUpdate}
        onConfirm={handleUpdateConfirm}
        onCancel={() => setPhotoToUpdate(null)}
      />
      <UpdateTakenAtDialog
        bulkCount={bulkUpdatePending ? selectedIds.size : null}
        onConfirm={handleBulkUpdateConfirm}
        onCancel={() => setBulkUpdatePending(false)}
      />
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
