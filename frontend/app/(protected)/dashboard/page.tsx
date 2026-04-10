"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import { userService, UserProfile } from "@/app/lib/services/user.service";
import { StorageNudgeBanner } from "@/app/(protected)/components/StorageNudgeBanner";
import { getPrimaryPhotoVersions } from "@/app/lib/photo-versions";
import { useLoadMore } from "@/app/lib/hooks/useLoadMore";
import { useUpload } from "@/app/context/UploadContext";
import { toast } from "sonner";
import { formatStorage } from "@/app/lib/utils";
import {
  flattenPages,
  getRefreshablePages,
  isPhotoInProgress,
  LoadedPage,
  mergePagesByCursor,
  reloadPagesFromStart,
} from "@/app/(protected)/dashboard/dashboard-utils";

export default function Page() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedPages, setLoadedPages] = useState<LoadedPage[]>([]);
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
  const { isUploading } = useUpload();
  const wasUploadingRef = useRef(false);
  const [storageSize, setStorageSize] = useState<{
    standardSize: number;
    glacierSize: number;
    standardPhotoCount: number;
    standardVideoCount: number;
    glacierPhotoCount: number;
    glacierVideoCount: number;
  } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const totalSize = useMemo(() => {
    if (!storageSize) return formatStorage(0);
    const bytes = storageSize.standardSize + storageSize.glacierSize;
    return formatStorage(bytes);
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

  const visiblePhotos = useMemo(() => getPrimaryPhotoVersions(photos), [photos]);

  const syncLoadedPages = useCallback((pages: LoadedPage[]) => {
    setLoadedPages(pages);
    setPhotos(flattenPages(pages));
    setNextCursor(pages.at(-1)?.nextCursor ?? null);
  }, []);

  const loadPhotos = useCallback(() => {
    return photoService
      .listPhotos()
      .then((data) => {
        syncLoadedPages([
          {
            cursor: null,
            photos: data.photos,
            nextCursor: data.nextCursor,
          },
        ]);
      })
      .catch(() => {});
  }, [syncLoadedPages]);

  const refreshLoadedPhotos = useCallback(() => {
    const refreshTargets = getRefreshablePages(loadedPages);
    if (refreshTargets.length === 0) return;

    Promise.all(
      refreshTargets.map((page) =>
        photoService.listPhotos(page.cursor ?? undefined),
      ),
    )
      .then((pages) => {
        const refreshedPages = pages.map((page, index) => ({
          cursor: refreshTargets[index].cursor,
          photos: page.photos,
          nextCursor: page.nextCursor,
        }));

        setLoadedPages((prevPages) => {
          const nextPages = mergePagesByCursor(prevPages, refreshedPages);
          setPhotos(flattenPages(nextPages));
          setNextCursor(nextPages.at(-1)?.nextCursor ?? null);
          return nextPages;
        });
      })
      .catch(() => {});
  }, [loadedPages]);

  const reloadVisiblePages = useCallback(() => {
    const pageCount = Math.max(loadedPages.length, 1);
    reloadPagesFromStart(pageCount, photoService.listPhotos)
      .then((pages) => {
        syncLoadedPages(pages);
      })
      .catch(() => {});
  }, [loadedPages.length, syncLoadedPages]);

  const loadStorageSize = useCallback(() => {
    photoService
      .getStorageSize()
      .then((data) => {
        setStorageSize(data);
      })
      .catch(() => {});
  }, []);

  const loadMore = useCallback(() => {
    const cursorToLoad = nextCursor;
    if (!cursorToLoad) return;
    setIsLoadingMore(true);
    photoService
      .listPhotos(cursorToLoad)
      .then((data) => {
        setPhotos((prev) => [...prev, ...data.photos]);
        setNextCursor(data.nextCursor);
        setLoadedPages((prev) => [
          ...prev,
          {
            cursor: cursorToLoad,
            photos: data.photos,
            nextCursor: data.nextCursor,
          },
        ]);
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
    loadPhotos().finally(() => setIsLoading(false));
    loadStorageSize();
    userService.getProfile().then(setUserProfile).catch(() => {});
  }, [loadPhotos, loadStorageSize]);

  useEffect(() => {
    const hasInProgress = loadedPages.some((page) =>
      page.photos.some(isPhotoInProgress),
    );
    if (!hasInProgress) return;
    const id = setInterval(() => {
      refreshLoadedPhotos();
    }, 3000);
    return () => clearInterval(id);
  }, [loadedPages, refreshLoadedPhotos]);

  useEffect(() => {
    if (isUploading) {
      wasUploadingRef.current = true;
    } else if (wasUploadingRef.current) {
      wasUploadingRef.current = false;
      setTimeout(() => {
        reloadVisiblePages();
        loadStorageSize();
      }, 2000);
    }
  }, [isUploading, reloadVisiblePages, loadStorageSize]);

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
    try {
      await photoService.deletePhoto(key);
      setPhotos((prev) => prev.filter((p) => p.s3Key !== key));
      setLoadedPages((prev) =>
        prev.map((page) => ({
          ...page,
          photos: page.photos.filter((p) => p.s3Key !== key),
        })),
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(photoToDelete.id);
        return next;
      });
      setPhotoToDelete(null);
      loadStorageSize();
    } catch {
      toast.error("Failed to delete photo. Please try again.");
    }
  };

  const handleRetry = useCallback(
    async (photo: Photo) => {
      try {
        const result = await photoService.retryFailedPhotos([photo.s3Key]);
        if (result.queuedCount === 0) {
          toast.error("Original file is missing, so this photo cannot be retried.");
          return;
        }

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, status: "processing" } : p,
          ),
        );
        setLoadedPages((prev) =>
          prev.map((page) => ({
            ...page,
            photos: page.photos.map((p) =>
              p.id === photo.id ? { ...p, status: "processing" } : p,
            ),
          })),
        );
        toast.success("Retry queued.");
      } catch {
        toast.error("Failed to retry this photo. Please try again.");
      }
    },
    [],
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
      setLoadedPages((prev) =>
        prev.map((page) => ({
          ...page,
          photos: page.photos.map((p) =>
            p.s3Key === updated.s3Key ? { ...p, takenAt: updated.takenAt } : p,
          ),
        })),
      );
    } catch {
      toast.error("Failed to update date. Please try again.");
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
      setLoadedPages((prev) =>
        prev.map((page) => ({
          ...page,
          photos: page.photos.map((p) =>
            toUpdate.some((u) => u.id === p.id) ? { ...p, takenAt } : p,
          ),
        })),
      );
      setBulkUpdatePending(false);
      setSelectedIds(new Set());
    } catch {
      toast.error("Failed to update dates. Please try again.");
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const toDelete = photos.filter((p) => selectedIds.has(p.id));
    try {
      await photoService.deletePhotos(toDelete.map((p) => p.s3Key));
      setPhotos((prev) =>
        prev.filter((p) => !toDelete.some((d) => d.id === p.id)),
      );
      setLoadedPages((prev) =>
        prev.map((page) => ({
          ...page,
          photos: page.photos.filter((p) => !toDelete.some((d) => d.id === p.id)),
        })),
      );
      setBulkDeletePending(false);
      setSelectedIds(new Set());
      loadStorageSize();
    } catch {
      toast.error("Failed to delete selected photos. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalUsageBytes = storageSize
    ? storageSize.standardSize + storageSize.glacierSize
    : 0;

  return (
    <div className="space-y-6 pb-8">
      {userProfile && userProfile.plan !== "on_demand" && (
        <StorageNudgeBanner
          plan={userProfile.plan}
          usageBytes={totalUsageBytes}
          limitBytes={userProfile.storageLimitBytes}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Photos</h1>
          <p className="text-sm text-muted-foreground">
            {photosCount.photo} photo{photosCount.photo !== 1 ? "s" : ""} and{" "}
            {photosCount.video} video{photosCount.video !== 1 ? "s" : ""} · {totalSize}
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
              <FileDropZone onFilesAccepted={() => setUploadDialogOpen(false)} />
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
            photos={visiblePhotos}
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
        key={viewerIndex === null ? "viewer-closed" : `viewer-${viewerIndex}-${visiblePhotos.length}`}
        photos={visiblePhotos}
        allPhotos={photos}
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
