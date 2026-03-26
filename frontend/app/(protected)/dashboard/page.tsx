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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import {
  CalendarDays,
  Download,
  Grid3X3,
  LayoutGrid,
  Trash2,
  Upload,
  Loader2Icon,
} from "lucide-react";
import FileDropZone from "@/app/(protected)/components/FileDropZone";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import UpdateTakenAtDialog from "@/app/(protected)/components/UpdateTakenAtDialog";
import ImageViewer from "@/app/(protected)/components/ImageViewer";
import DownloadModal from "@/app/(protected)/components/DownloadModal";
import { photoService, Photo } from "@/app/lib/services/photo.service";
import { useLoadMore } from "@/app/lib/hooks/useLoadMore";

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [photoToUpdate, setPhotoToUpdate] = useState<Photo | null>(null);
  const [bulkUpdatePending, setBulkUpdatePending] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "large">("grid");
  const [storageSize, setStorageSize] = useState<{
    standardSize: number;
    glacierSize: number;
    standardPhotoCount: number;
    standardVideoCount: number;
    glacierPhotoCount: number;
    glacierVideoCount: number;
  } | null>(null);

  const totalSizeMB = useMemo(() => {
    if (!storageSize) return "0.00";
    const bytes = storageSize.standardSize + storageSize.glacierSize;
    return (bytes / (1024 * 1024)).toFixed(2);
  }, [storageSize]);

  const photosCount = useMemo(() => {
    if (!storageSize)
      return { photo: 0, video: 0 };
    return {
      photo:
        storageSize.standardPhotoCount + storageSize.glacierPhotoCount,
      video:
        storageSize.standardVideoCount + storageSize.glacierVideoCount,
    };
  }, [storageSize]);

  const loadPhotos = useCallback(() => {
    photoService
      .listPhotos()
      .then((data) => {
        setPhotos(data.photos);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {});
  }, []);

  const loadStorageSize = useCallback(() => {
    photoService
      .getStorageSize()
      .then((data) => {
        setStorageSize(data);
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

  const sentinelRef = useLoadMore({
    nextCursor,
    isLoadingMore,
    onLoadMore: loadMore,
  });

  useEffect(() => {
    photoService
      .listPhotos()
      .then((data) => {
        setPhotos(data.photos);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
    loadStorageSize();
  }, [loadStorageSize]);

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
    setTimeout(() => {
      loadPhotos();
      loadStorageSize();
    }, 2000);
  }, [loadPhotos, loadStorageSize]);

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
      loadStorageSize();
    } catch {
      // ignore
    }
  };

  const handleRetry = useCallback(
    async (photo: Photo) => {
      try {
        await photoService.deletePhoto(photo.s3Key);
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        loadStorageSize();
      } catch {
        // ignore
      }
      setUploadDialogOpen(true);
    },
    [loadStorageSize],
  );

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
    try {
      await photoService.updatePhotosTakenAt(
        toUpdate.map((p) => p.s3Key),
        takenAt,
      );
      setPhotos((prev) =>
        prev.map((p) =>
          toUpdate.some((u) => u.id === p.id) ? { ...p, takenAt } : p,
        ),
      );
    } catch {
      // ignore
    } finally {
      setBulkUpdatePending(false);
      setSelectedIds(new Set());
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const toDelete = photos.filter((p) => selectedIds.has(p.id));
    setBulkDeletePending(false);
    setSelectedIds(new Set());
    try {
      await photoService.deletePhotos(toDelete.map((p) => p.s3Key));
      setPhotos((prev) =>
        prev.filter((p) => !toDelete.some((d) => d.id === p.id)),
      );
      loadStorageSize();
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Photos</h1>
          <p className="text-sm text-muted-foreground">
            {photosCount.photo} photo{photosCount.photo !== 1 ? "s" : ""} and{" "}
            {photosCount.video} video{photosCount.video !== 1 ? "s" : ""} · {totalSizeMB} MB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "large")} className="hidden sm:block">
            <TabsList className="h-9 bg-secondary">
              <TabsTrigger value="grid" className="px-3">
                <Grid3X3 className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="large" className="px-3">
                <LayoutGrid className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Your Files</DialogTitle>
              </DialogHeader>
              <FileDropZone onUploadComplete={handleUploadComplete} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {photos.length > 0 && (
        <div>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-secondary p-3 mb-4">
              <span className="text-sm font-medium">
                {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkUpdatePending(true)}
                >
                  <CalendarDays className="mr-2 size-4" />
                  Update date
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDownloadPending(true)}
                >
                  <Download className="mr-2 size-4" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setBulkDeletePending(true)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <PhotoGrid
            photos={photos}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDeleteRequest={setPhotoToDelete}
            onPhotoClick={setViewerIndex}
            onRetry={handleRetry}
            viewMode={viewMode}
          />
          <div ref={sentinelRef} className="h-4" />
          {isLoadingMore && (
            <div className="flex justify-center mt-4">
              <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
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
      {downloadPending && (
        <DownloadModal
          isOpen={downloadPending}
          onClose={() => setDownloadPending(false)}
          photos={photos.filter((p) => selectedIds.has(p.id))}
        />
      )}
    </div>
  );
}
