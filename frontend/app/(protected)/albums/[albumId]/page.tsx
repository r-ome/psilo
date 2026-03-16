"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Trash2, Pencil, Plus, Check, CheckSquare, Square, Download, Loader2Icon, CalendarDays, ArchiveRestore } from "lucide-react";
import {
  albumService,
  Album,
  AlbumWithPhotos,
} from "@/app/lib/services/album.service";
import { photoService, Photo } from "@/app/lib/services/photo.service";
import { retrievalService, RetrievalBatch } from "@/app/lib/services/retrieval.service";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import UpdateTakenAtDialog from "@/app/(protected)/components/UpdateTakenAtDialog";
import DownloadModal from "@/app/(protected)/components/DownloadModal";
import ImageViewer from "@/app/(protected)/components/ImageViewer";
import EditAlbumDialog from "@/app/(protected)/albums/[albumId]/EditAlbumDialog";
import { useLoadMore } from "@/app/lib/hooks/useLoadMore";
import { downloadService, GlacierTier } from "@/app/lib/services/download.service";
import { toast } from "sonner";

export default function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumId: string }>;
}) {
  const router = useRouter();
  const { albumId } = use(params);
  const [album, setAlbum] = useState<Album | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([]);
  const [albumNextCursor, setAlbumNextCursor] = useState<string | null>(null);
  const [isLoadingMoreAlbum, setIsLoadingMoreAlbum] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [photoToRemove, setPhotoToRemove] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemovePending, setBulkRemovePending] = useState(false);
  const [albumDeletePending, setAlbumDeletePending] = useState(false);
  const [albumDownloadOpen, setAlbumDownloadOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [pickerNextCursor, setPickerNextCursor] = useState<string | null>(null);
  const [isLoadingMorePicker, setIsLoadingMorePicker] = useState(false);
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);
  const [albumToEdit, setAlbumToEdit] = useState<Album | null>(null);
  const [photoToUpdate, setPhotoToUpdate] = useState<Photo | null>(null);
  const [restoreAlbumOpen, setRestoreAlbumOpen] = useState(false);
  const [restoreAlbumTier, setRestoreAlbumTier] = useState<GlacierTier>("Standard");
  const [restoreAlbumLoading, setRestoreAlbumLoading] = useState(false);
  // undefined = still loading, null = no active batch
  const [albumBatch, setAlbumBatch] = useState<RetrievalBatch | null | undefined>(undefined);
  const [bulkUpdatePending, setBulkUpdatePending] = useState(false);
  const pickerScrollContainerRef = useRef<HTMLDivElement>(null);
  const prevShowPickerRef = useRef(false);

  const loadAlbum = useCallback(async () => {
    try {
      const data = await albumService.getAlbum(albumId);
      setAlbum(data);
      setAlbumPhotos(data.photos);
      setAlbumNextCursor(data.nextCursor);
    } catch {
      // ignore
    }
  }, [albumId]);

  useEffect(() => {
    albumService
      .getAlbum(albumId)
      .then((data) => {
        setAlbum(data);
        setAlbumPhotos(data.photos);
        setAlbumNextCursor(data.nextCursor);
      })
      .catch(() => {});
    photoService
      .listPhotos()
      .then((data) => {
        setAllPhotos(data.photos);
        setPickerNextCursor(data.nextCursor);
      })
      .catch(() => {});
  }, [albumId]);

  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);

  const loadMoreAlbumPhotos = useCallback(() => {
    if (!albumNextCursor || isLoadingMoreAlbum) return;
    setIsLoadingMoreAlbum(true);
    albumService
      .getAlbum(albumId, albumNextCursor)
      .then((data) => {
        setAlbumPhotos((prev) => [...prev, ...data.photos]);
        setAlbumNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMoreAlbum(false));
  }, [albumId, albumNextCursor, isLoadingMoreAlbum]);

  const loadMorePhotosForPicker = useCallback(() => {
    if (!pickerNextCursor) return;
    setIsLoadingMorePicker(true);
    photoService
      .listPhotos(pickerNextCursor)
      .then((data) => {
        setAllPhotos((prev) => [...prev, ...data.photos]);
        setPickerNextCursor(data.nextCursor);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMorePicker(false));
  }, [pickerNextCursor]);

  // Poll for status updates on pending/processing photos in current view
  useEffect(() => {
    const hasInProgress = albumPhotos.some(
      (p) => p.status === "pending" || p.status === "processing",
    );
    if (!hasInProgress) return;
    const id = setInterval(() => {
      albumService
        .getAlbum(albumId)
        .then((freshData) => {
          setAlbum(freshData);
          const updatedMap = new Map(freshData.photos.map((p) => [p.id, p]));
          setAlbumPhotos((prev) => prev.map((p) => updatedMap.get(p.id) ?? p));
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [albumPhotos, albumId]);

  const handleToggleSelect = (photo: Photo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photo.id)) next.delete(photo.id);
      else next.add(photo.id);
      return next;
    });
  };

  const handleRemoveConfirm = async () => {
    if (!photoToRemove) return;
    const id = photoToRemove.id;
    setPhotoToRemove(null);
    try {
      await albumService.removePhotoFromAlbum(albumId, id);
      setAlbumPhotos((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      // ignore
    }
  };

  const handleBulkRemoveConfirm = async () => {
    const toRemove = albumPhotos.filter((p) => selectedIds.has(p.id));
    setBulkRemovePending(false);
    setSelectedIds(new Set());
    try {
      await Promise.all(
        toRemove.map((p) => albumService.removePhotoFromAlbum(albumId, p.id)),
      );
      setAlbumPhotos((prev) =>
        prev.filter((p) => !toRemove.some((r) => r.id === p.id)),
      );
    } catch {
      // ignore
    }
  };

  const handlePickerToggle = (photoId: string) => {
    setPickerSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const handleAddPhotos = async () => {
    if (pickerSelectedIds.size === 0) return;
    setIsAddingPhotos(true);
    try {
      await Promise.all(
        [...pickerSelectedIds].map((id) =>
          albumService.addPhotoToAlbum(albumId, id),
        ),
      );
      await loadAlbum();
    } catch {
      // ignore
    } finally {
      setIsAddingPhotos(false);
      setShowPicker(false);
      setPickerSelectedIds(new Set());
    }
  };

  const handleDeleteAlbum = async () => {
    setAlbumDeletePending(false);
    try {
      await albumService.deleteAlbum(albumId);
      router.push("/dashboard");
    } catch {
      // ignore
    }
  };

  const handleToggleSelectMode = () => {
    setSelectMode((prev) => !prev);
    if (selectMode) setSelectedIds(new Set());
  };

  const handleUpdateConfirm = async (takenAt: string | null) => {
    if (!photoToUpdate) return;
    const key = photoToUpdate.s3Key;
    setPhotoToUpdate(null);
    try {
      const updated = await photoService.updatePhotoTakenAt(key, takenAt);
      setAlbumPhotos((prev) =>
        prev.map((p) =>
          p.s3Key === updated.s3Key ? { ...p, takenAt: updated.takenAt } : p,
        ),
      );
    } catch {
      // ignore
    }
  };

  const handleBulkUpdateConfirm = async (takenAt: string | null) => {
    const toUpdate = albumPhotos.filter((p) => selectedIds.has(p.id));
    try {
      await photoService.updatePhotosTakenAt(
        toUpdate.map((p) => p.s3Key),
        takenAt,
      );
      setAlbumPhotos((prev) =>
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

  const handleRestoreAlbum = async () => {
    if (!album) return;
    const glacierPhotos = albumPhotos.filter((p) => p.storageClass === "GLACIER");
    if (glacierPhotos.length === 0) return;
    setRestoreAlbumLoading(true);
    try {
      const result = await downloadService.requestDownload(
        glacierPhotos.map((p) => p.s3Key),
        restoreAlbumTier,
        albumId,
        "ALBUM",
      );
      setRestoreAlbumOpen(false);

      const active = result.alreadyActive ?? [];
      const newCount = glacierPhotos.length - active.length;

      if (active.length > 0 && newCount === 0) {
        // Every photo already has an active restore
        const readyCount = active.filter(
          (r) => r.batchStatus === "COMPLETED" || r.batchStatus === "AVAILABLE",
        ).length;
        if (readyCount > 0) {
          toast.info("These photos already have an active restore — check Restore Requests to download.", {
            action: { label: "View", onClick: () => router.push("/restore-requests") },
          });
        } else {
          toast.info("Restore already in progress for these photos.", {
            action: { label: "View", onClick: () => router.push("/restore-requests") },
          });
        }
      } else if (active.length > 0 && newCount > 0) {
        toast.success(
          `Restore started for ${newCount} photo${newCount !== 1 ? "s" : ""}. ${active.length} photo${active.length !== 1 ? "s" : ""} already had an active restore.`,
          { action: { label: "View", onClick: () => router.push("/restore-requests") } },
        );
      } else {
        toast.success(
          `Restore initiated for ${glacierPhotos.length} photo${glacierPhotos.length !== 1 ? "s" : ""}. Check Restore Requests for status.`,
          { action: { label: "View", onClick: () => router.push("/restore-requests") } },
        );
      }
    } catch {
      toast.error("Failed to initiate restore. Please try again.");
    } finally {
      setRestoreAlbumLoading(false);
    }
  };

  const BATCH_IN_FLIGHT: RetrievalBatch["status"][] = ["PENDING", "IN_PROGRESS", "ZIPPING"];
  const BATCH_READY: RetrievalBatch["status"][] = ["COMPLETED", "AVAILABLE", "PARTIAL_FAILURE", "PARTIAL"];

  const fetchAlbumBatch = useCallback(() => {
    const now = new Date();
    retrievalService.listBatches().then(({ batches }) => {
      const active = batches
        .filter((b) => b.sourceId === albumId)
        .filter((b) => b.status !== "EXPIRED" && b.status !== "FAILED")
        .filter((b) => !b.expiresAt || new Date(b.expiresAt) > now)
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())[0] ?? null;
      setAlbumBatch(active);
    }).catch(() => setAlbumBatch(null));
  }, [albumId]);

  useEffect(() => { fetchAlbumBatch(); }, [fetchAlbumBatch]);

  // Poll while the batch is still being processed
  useEffect(() => {
    if (!albumBatch || !BATCH_IN_FLIGHT.includes(albumBatch.status)) return;
    const interval = setInterval(fetchAlbumBatch, 5000);
    return () => clearInterval(interval);
  }, [albumBatch, fetchAlbumBatch]);

  const albumPhotoIds = new Set(albumPhotos.map((p) => p.id));
  const availablePhotos = allPhotos.filter(
    (p) => !albumPhotoIds.has(p.id) && p.status === "completed",
  );

  const pickerSentinelRef = useLoadMore({
    nextCursor: pickerNextCursor,
    isLoadingMore: isLoadingMorePicker,
    onLoadMore: loadMorePhotosForPicker,
    scrollContainerRef: pickerScrollContainerRef,
    isOpen: showPicker,
  });

  const albumSentinelRef = useLoadMore({
    nextCursor: albumNextCursor,
    isLoadingMore: isLoadingMoreAlbum,
    onLoadMore: loadMoreAlbumPhotos,
  });

  // When the dialog opens, explicitly check if the sentinel is already visible
  // and trigger load-more immediately — IntersectionObserver alone is unreliable
  // during the dialog's open animation.
  useEffect(() => {
    const justOpened = showPicker && !prevShowPickerRef.current;
    prevShowPickerRef.current = showPicker;
    if (!justOpened) return;

    const timeoutId = setTimeout(() => {
      const container = pickerScrollContainerRef.current;
      const sentinel = pickerSentinelRef.current;
      if (!container || !sentinel) return;
      const { bottom: sentinelBottom } = sentinel.getBoundingClientRect();
      const { bottom: containerBottom } = container.getBoundingClientRect();
      if (sentinelBottom <= containerBottom) {
        loadMorePhotosForPicker();
      }
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [showPicker, loadMorePhotosForPicker, pickerSentinelRef]);

  if (!album)
    return (
      <div className="flex justify-center items-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{album.name}</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAlbumToEdit(album)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAlbumDeletePending(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {albumPhotos.length > 0 && (() => {
            const hasGlacier = albumPhotos.some((p) => p.storageClass === "GLACIER");
            if (!hasGlacier) {
              return (
                <Button variant="outline" size="sm" onClick={() => setAlbumDownloadOpen(true)}>
                  <Download className="h-4 w-4 mr-1" />
                  Download Album
                </Button>
              );
            }
            if (albumBatch && BATCH_READY.includes(albumBatch.status)) {
              return (
                <Button variant="outline" size="sm" onClick={() => router.push("/restore-requests")}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              );
            }
            if (albumBatch && BATCH_IN_FLIGHT.includes(albumBatch.status)) {
              return (
                <Button variant="outline" size="sm" disabled>
                  <Loader2Icon className="h-4 w-4 mr-1 animate-spin" />
                  Restoring…
                </Button>
              );
            }
            return (
              <Button variant="outline" size="sm" onClick={() => setRestoreAlbumOpen(true)}>
                <ArchiveRestore className="h-4 w-4 mr-1" />
                Restore Album
              </Button>
            );
          })()}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPicker(true);
              setPickerSelectedIds(new Set());
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Photos
          </Button>
          {albumPhotos.length > 0 && (
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
      </div>

      <Dialog
        open={showPicker}
        onOpenChange={(open) => {
          if (!open) {
            setShowPicker(false);
            setPickerSelectedIds(new Set());
          }
        }}
      >
        <DialogContent className="w-160 h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add Photos to {album.name}</DialogTitle>
          </DialogHeader>
          <div
            ref={pickerScrollContainerRef}
            className="flex-1 overflow-y-auto min-h-0"
          >
            {availablePhotos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No photos available to add.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-2">
                {availablePhotos.map((photo) => {
                  const selected = pickerSelectedIds.has(photo.id);
                  return (
                    <button
                      key={photo.id}
                      className={`relative rounded overflow-hidden border-2 transition-colors text-left hover:cursor-pointer ${selected ? "border-primary" : "border-transparent"}`}
                      onClick={() => handlePickerToggle(photo.id)}
                    >
                      <div className="relative aspect-square bg-muted">
                        <Image
                          src={
                            photo.contentType?.startsWith("video/")
                              ? photo.thumbnailUrl || photo.signedUrl || ""
                              : photo.thumbnailUrl || ""
                          }
                          alt={photo.filename}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 33vw, 25vw"
                        />
                      </div>
                      {selected && (
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full p-0.5">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
                <div ref={pickerSentinelRef} className="col-span-full h-4" />
              </div>
            )}
            {isLoadingMorePicker && (
              <div className="flex justify-center py-2">
                <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPicker(false);
                setPickerSelectedIds(new Set());
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddPhotos}
              disabled={pickerSelectedIds.size === 0 || isAddingPhotos}
            >
              {isAddingPhotos && <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />}
              Add {pickerSelectedIds.size > 0 ? `(${pickerSelectedIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {albumPhotos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No photos in this album.
        </p>
      ) : (
        <div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-4">
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
                onClick={() => setBulkRemovePending(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove selected
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
          <PhotoGrid
            photos={albumPhotos}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDeleteRequest={setPhotoToRemove}
            onPhotoClick={setViewerIndex}
            selectMode={selectMode}
          />
          <div ref={albumSentinelRef} className="h-4" />
          {isLoadingMoreAlbum && (
            <div className="flex justify-center py-4">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
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
        photo={photoToRemove}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setPhotoToRemove(null)}
      />
      <DeleteConfirmDialog
        bulkCount={bulkRemovePending ? selectedIds.size : null}
        onConfirm={handleBulkRemoveConfirm}
        onCancel={() => setBulkRemovePending(false)}
      />
      <DeleteConfirmDialog
        customTitle={albumDeletePending ? `Delete "${album.name}"?` : undefined}
        customDescription={
          albumDeletePending
            ? `Are you sure you want to delete "${album.name}"? This action cannot be undone.`
            : undefined
        }
        onConfirm={handleDeleteAlbum}
        onCancel={() => setAlbumDeletePending(false)}
      />
      <ImageViewer
        photos={albumPhotos}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        currentAlbum={album as AlbumWithPhotos}
      />
      <DownloadModal
        isOpen={albumDownloadOpen}
        onClose={() => setAlbumDownloadOpen(false)}
        photos={albumPhotos}
      />
      <Dialog open={restoreAlbumOpen} onOpenChange={setRestoreAlbumOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore Glacier Photos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {albumPhotos.filter((p) => p.storageClass === "GLACIER").length} photo
              {albumPhotos.filter((p) => p.storageClass === "GLACIER").length !== 1 ? "s are" : " is"} archived in Glacier. Select a restore tier:
            </p>
            <div className="space-y-2">
              {(
                [
                  { id: "Expedited" as GlacierTier, label: "Expedited", speed: "1–5 minutes", cost: "$0.03/GB + $0.01/1,000 requests" },
                  { id: "Standard" as GlacierTier, label: "Standard", speed: "3–5 hours", cost: "$0.01/GB + $0.05/1,000 requests" },
                  { id: "Bulk" as GlacierTier, label: "Bulk", speed: "5–12 hours", cost: "$0.025/1,000 requests" },
                ]
              ).map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setRestoreAlbumTier(tier.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    restoreAlbumTier === tier.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{tier.label}</span>
                    <span className="text-xs text-muted-foreground">{tier.speed}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tier.cost}</p>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreAlbumOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRestoreAlbum} disabled={restoreAlbumLoading}>
              {restoreAlbumLoading && <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />}
              Request Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EditAlbumDialog
        album={albumToEdit}
        onCancel={() => setAlbumToEdit(null)}
        onConfirm={async (name) => {
          await albumService.updateAlbum(albumId, name);
          setAlbum((prev) =>
            prev ? { ...prev, name } : prev,
          );
          setAlbumToEdit(null);
        }}
      />
    </div>
  );
}
