"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Trash2, Plus, Check, CheckSquare, Square } from "lucide-react";
import {
  albumService,
  AlbumWithPhotos,
} from "@/app/lib/services/album.service";
import { photoService, Photo } from "@/app/lib/services/photo.service";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import ImageViewer from "@/app/(protected)/components/ImageViewer";

export default function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumId: string }>;
}) {
  const router = useRouter();
  const { albumId } = use(params);
  const [album, setAlbum] = useState<AlbumWithPhotos | null>(null);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [photoToRemove, setPhotoToRemove] = useState<Photo | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemovePending, setBulkRemovePending] = useState(false);
  const [albumDeletePending, setAlbumDeletePending] = useState(false);
  const [selectMode, setSelectMode] = useState(false);

  const loadAlbum = useCallback(async () => {
    try {
      const data = await albumService.getAlbum(albumId);
      setAlbum(data);
    } catch {
      // ignore
    }
  }, [albumId]);

  useEffect(() => {
    albumService
      .getAlbum(albumId)
      .then(setAlbum)
      .catch(() => {});
    photoService
      .listPhotos()
      .then((data) => setAllPhotos(data.photos))
      .catch(() => {});
  }, [albumId]);

  useEffect(() => {
    const albumHasInProgress = album?.photos.some(
      (p) => p.status === "pending" || p.status === "processing",
    );
    if (!albumHasInProgress) return;
    const id = setInterval(() => {
      albumService
        .getAlbum(albumId)
        .then(setAlbum)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [album, albumId]);

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
      setAlbum((prev) =>
        prev
          ? { ...prev, photos: prev.photos.filter((p) => p.id !== id) }
          : prev,
      );
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
    if (!album) return;
    const toRemove = album.photos.filter((p) => selectedIds.has(p.id));
    setBulkRemovePending(false);
    setSelectedIds(new Set());
    try {
      await Promise.all(
        toRemove.map((p) => albumService.removePhotoFromAlbum(albumId, p.id)),
      );
      setAlbum((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.filter(
                (p) => !toRemove.some((r) => r.id === p.id),
              ),
            }
          : prev,
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

  const albumPhotoIds = new Set(album?.photos.map((p) => p.id) ?? []);
  const availablePhotos = allPhotos.filter(
    (p) => !albumPhotoIds.has(p.id) && p.status === "completed",
  );

  if (!album)
    return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{album.name}</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAlbumDeletePending(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
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
          {album.photos.length > 0 && (
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Photos to {album.name}</DialogTitle>
          </DialogHeader>
          {availablePhotos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No photos available to add.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto py-2">
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
                        src={photo.contentType?.startsWith("video/") ? (photo.signedUrl || "") : (photo.thumbnailUrl || "")}
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
            </div>
          )}
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
              disabled={pickerSelectedIds.size === 0}
            >
              Add{" "}
              {pickerSelectedIds.size > 0 ? `(${pickerSelectedIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {album.photos.length === 0 ? (
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
            photos={album.photos}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onDeleteRequest={setPhotoToRemove}
            onPhotoClick={setViewerIndex}
            selectMode={selectMode}
          />
        </div>
      )}

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
        photos={album.photos}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        currentAlbum={album}
      />
    </div>
  );
}
