"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/app/components/ui/carousel";
import {
  MoreHorizontal,
  PlusCircle,
  Download,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Photo } from "@/app/lib/services/photo.service";
import { Album } from "@/app/lib/services/album.service";
import {
  getRelatedPhotoVersions,
  isEditedPhotoVersion,
} from "@/app/lib/photo-versions";
import AddToAlbumModal from "./AddToAlbumModal";
import DownloadModal from "./DownloadModal";

interface ImageViewerProps {
  photos: Photo[];
  allPhotos?: Photo[];
  initialIndex: number | null;
  onClose: () => void;
  currentAlbum?: Album | null;
  onRestore?: (photo: Photo) => void;
  onPermanentDelete?: (photo: Photo) => void;
}

export default function ImageViewer({
  photos,
  allPhotos,
  initialIndex,
  onClose,
  currentAlbum,
  onRestore,
  onPermanentDelete,
}: ImageViewerProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  const [isAddToAlbumOpen, setIsAddToAlbumOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  if (prevInitialIndex !== initialIndex && initialIndex !== null) {
    setPrevInitialIndex(initialIndex);
    setCurrentIndex(initialIndex);
  }

  useEffect(() => {
    if (api && initialIndex !== null) {
      api.scrollTo(initialIndex, true);
    }
  }, [api, initialIndex]);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setCurrentIndex(api.selectedScrollSnap());
      setSelectedVersionId(null);
    };
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  const currentPhoto = photos[currentIndex];
  const versionSource = allPhotos ?? photos;
  const relatedVersions = getRelatedPhotoVersions(versionSource, currentPhoto);
  const displayedPhoto =
    relatedVersions.find((photo) => photo.id === selectedVersionId) ?? currentPhoto;

  const getVersionPreviewUrl = (photo: Photo) =>
    photo.thumbnailUrl ?? photo.previewUrl ?? photo.signedUrl ?? null;
  const mediaClass = "max-h-full max-w-full w-auto h-auto object-contain mx-auto";
  const handleViewerKeyDownCapture = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      api?.scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      api?.scrollNext();
    }
  };

  const renderPhoto = (photo: Photo) => {
    if (photo.contentType?.startsWith("video/")) {
      if (photo.storageClass === "GLACIER") {
        return photo.previewUrl ? (
          <video
            controls
            className="max-h-full max-w-full w-auto mx-auto"
          >
            <source src={photo.previewUrl} type="video/mp4" />
          </video>
        ) : (
          <div className="flex flex-col items-center justify-center text-white/50 gap-2">
            <span>Video archived in Glacier</span>
            <span className="text-sm">Preview unavailable</span>
          </div>
        );
      }

      return photo.signedUrl ? (
        <video
          controls
          className="max-h-full max-w-full w-auto mx-auto"
        >
          <source
            src={photo.signedUrl}
            type={photo.contentType || undefined}
          />
        </video>
      ) : null;
    }

    if (photo.storageClass !== "GLACIER" && photo.signedUrl) {
      return (
        <Image
          src={photo.signedUrl}
          alt={photo.filename}
          width={photo.width ?? 1200}
          height={photo.height ?? 800}
          className={mediaClass}
          unoptimized
        />
      );
    }

    if (photo.previewUrl) {
      return (
        <Image
          src={photo.previewUrl}
          alt={photo.filename}
          width={photo.width ?? 1200}
          height={photo.height ?? 800}
          className={mediaClass}
          unoptimized
        />
      );
    }

    if (photo.thumbnailUrl) {
      return (
        <Image
          src={photo.thumbnailUrl}
          alt={photo.filename}
          width={photo.width ?? 1200}
          height={photo.height ?? 800}
          className={mediaClass}
          unoptimized
        />
      );
    }

    return null;
  };

  return (
    <Dialog
      open={initialIndex !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] p-0 bg-black border-0 flex flex-col overflow-hidden text-white"
        onEscapeKeyDown={() => onClose()}
        onKeyDownCapture={handleViewerKeyDownCapture}
      >
        <DialogTitle className="sr-only">Image viewer</DialogTitle>

        <div className="flex-1 min-h-0 relative">
          <Carousel setApi={setApi} className="w-full h-full">
            <CarouselContent className="h-full ml-0!">
              {photos.map((photo) => (
                <CarouselItem
                  key={photo.id}
                  className="flex h-full min-h-0 items-center justify-center p-8 pl-8!"
                >
                  {photo.id === currentPhoto?.id && displayedPhoto
                    ? renderPhoto(displayedPhoto)
                    : renderPhoto(photo)}
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2 bg-white/20 border-white/40 text-white hover:bg-white/40 hover:text-white" />
            <CarouselNext className="right-2 bg-white/20 border-white/40 text-white hover:bg-white/40 hover:text-white" />
          </Carousel>
        </div>

        {relatedVersions.length > 1 && currentPhoto && (
          <div className="shrink-0 border-t border-white/10 px-6 py-3">
            <div className="mb-2 text-center text-xs uppercase tracking-[0.2em] text-white/50">
              Versions
            </div>
            <div className="flex justify-center">
              <div className="flex max-w-full gap-3 overflow-x-auto pb-1">
              {relatedVersions.map((photo) => {
                const previewUrl = getVersionPreviewUrl(photo);
                const isCurrentVersion = photo.id === displayedPhoto?.id;

                return (
                  <button
                    key={photo.id}
                    type="button"
                    tabIndex={-1}
                    className={`shrink-0 text-left ${isCurrentVersion ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      setSelectedVersionId(photo.id);
                      event.currentTarget.blur();
                    }}
                  >
                    <div
                      className={`relative h-16 w-16 overflow-hidden rounded-md border ${
                        isCurrentVersion ? "border-white" : "border-white/20"
                      }`}
                    >
                      {previewUrl ? (
                        <Image
                          src={previewUrl}
                          alt={photo.filename}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-white/10 px-2 text-[10px] text-white/70">
                          {photo.filename}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-white/70">
                      {isEditedPhotoVersion(photo.filename) ? "Edited" : "Original"}
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        )}

        <div className="h-16 shrink-0 flex items-center justify-between gap-2 text-sm text-white/70 px-6">
          {displayedPhoto && (
            <div className="flex gap-2">
              <span>{displayedPhoto.filename}</span>
              {displayedPhoto.size != null && (
                <span>
                  · {(displayedPhoto.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              )}
              {displayedPhoto.createdAt && (
                <span>
                  ·{" "}
                  {new Date(displayedPhoto.createdAt).toLocaleDateString(
                    undefined,
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    },
                  )}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            {currentAlbum && (
              <Link
                href={`/albums/${currentAlbum.id}`}
                className="text-white/70 hover:text-white transition-colors underline"
              >
                {currentAlbum.name}
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/70 hover:text-white hover:bg-white/10"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!onRestore && !onPermanentDelete && (
                  <DropdownMenuItem onClick={() => setIsDownloadOpen(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                )}
                {!currentAlbum && !onRestore && !onPermanentDelete && (
                  <DropdownMenuItem onClick={() => setIsAddToAlbumOpen(true)}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add to Album
                  </DropdownMenuItem>
                )}
                {onRestore && displayedPhoto && (
                  <DropdownMenuItem
                    onClick={() => {
                      onRestore(displayedPhoto);
                      onClose();
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restore
                  </DropdownMenuItem>
                )}
                {onPermanentDelete && displayedPhoto && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      onPermanentDelete(displayedPhoto);
                      onClose();
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete permanently
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <AddToAlbumModal
          isOpen={isAddToAlbumOpen}
          onClose={() => setIsAddToAlbumOpen(false)}
          photo={displayedPhoto ?? null}
        />
        {displayedPhoto && (
          <DownloadModal
            isOpen={isDownloadOpen}
            onClose={() => setIsDownloadOpen(false)}
            photos={[displayedPhoto]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
