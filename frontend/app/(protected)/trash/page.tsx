"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  Square,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import ImageViewer from "@/app/(protected)/components/ImageViewer";
import { photoService, Photo } from "@/app/lib/services/photo.service";
import { useLoadMore } from "@/app/lib/hooks/useLoadMore";

export default function TrashPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRestorePending, setBulkRestorePending] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

  const loadPhotos = useCallback(() => {
    photoService
      .listTrashPhotos()
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
      .listTrashPhotos(nextCursor)
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
      .listTrashPhotos()
      .then((data) => {
        setPhotos(data.photos);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggleSelect = (photo: Photo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  };

  const handleBulkRestoreConfirm = async () => {
    const toRestore = photos.filter((p) => selectedIds.has(p.id));
    setBulkRestorePending(false);
    setSelectedIds(new Set());
    try {
      await photoService.restorePhotos(toRestore.map((p) => p.s3Key));
      setPhotos((prev) =>
        prev.filter((p) => !toRestore.some((r) => r.id === p.id)),
      );
    } catch {
      // ignore
    }
  };

  const handleToggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    if (selectMode) setSelectedIds(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
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
          {photos.length} item{photos.length !== 1 ? "s" : ""}
        </div>
      </div>

      {photos.length > 0 ? (
        <div>
          <div className="flex items-center justify-end mb-4">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setBulkRestorePending(true)}
                >
                  Restore
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
            onPhotoClick={setViewerIndex}
            selectMode={selectMode}
          />
          <div ref={sentinelRef} className="h-4" />
          {isLoadingMore && (
            <div className="flex justify-center mt-4">
              <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">Trash is empty</p>
        </div>
      )}

      {bulkRestorePending && (
        <DeleteConfirmDialog
          bulkCount={selectedIds.size}
          customTitle={`Restore ${selectedIds.size} photo${selectedIds.size === 1 ? "" : "s"}?`}
          customDescription={`Are you sure you want to restore ${selectedIds.size} photo${selectedIds.size === 1 ? "" : "s"} to your library?`}
          customActionLabel="Restore"
          isDangerous={false}
          onConfirm={handleBulkRestoreConfirm}
          onCancel={() => setBulkRestorePending(false)}
        />
      )}
      <ImageViewer
        photos={photos}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
