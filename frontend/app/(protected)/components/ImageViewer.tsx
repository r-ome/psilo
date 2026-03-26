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
import { MoreHorizontal, PlusCircle, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Photo } from "@/app/lib/services/photo.service";
import { Album } from "@/app/lib/services/album.service";
import AddToAlbumModal from "./AddToAlbumModal";
import DownloadModal from "./DownloadModal";

interface ImageViewerProps {
  photos: Photo[];
  initialIndex: number | null;
  onClose: () => void;
  currentAlbum?: Album | null;
}

export default function ImageViewer({
  photos,
  initialIndex,
  onClose,
  currentAlbum,
}: ImageViewerProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);
  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);
  const [isAddToAlbumOpen, setIsAddToAlbumOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);

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
    const onSelect = () => setCurrentIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (initialIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") api?.scrollPrev();
      else if (e.key === "ArrowRight") api?.scrollNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [api, initialIndex]);

  const currentPhoto = photos[currentIndex];

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
      >
        <DialogTitle className="sr-only">Image viewer</DialogTitle>

        <div className="flex-1 min-h-0 relative">
          <Carousel setApi={setApi} className="w-full h-full">
            <CarouselContent className="h-full ml-0!">
              {photos.map((photo) => (
                <CarouselItem
                  key={photo.id}
                  className="flex items-center justify-center p-8 pl-8! h-full"
                >
                  {photo.contentType?.startsWith("video/") ? (
                    photo.storageClass === "GLACIER" ? (
                      photo.previewUrl ? (
                        <video
                          controls
                          className="max-h-[calc(90vh-5rem)] max-w-full w-auto mx-auto"
                        >
                          <source src={photo.previewUrl} type="video/mp4" />
                        </video>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-white/50 gap-2">
                          <span>Video archived in Glacier</span>
                          <span className="text-sm">Preview unavailable</span>
                        </div>
                      )
                    ) : photo.signedUrl ? (
                      <video
                        controls
                        className="max-h-[calc(90vh-5rem)] max-w-full w-auto mx-auto"
                      >
                        <source
                          src={photo.signedUrl}
                          type={photo.contentType || undefined}
                        />
                      </video>
                    ) : null
                  ) : photo.storageClass !== "GLACIER" && photo.signedUrl ? (
                    <Image
                      src={photo.signedUrl}
                      alt={photo.filename}
                      width={photo.width ?? 1200}
                      height={photo.height ?? 800}
                      className="max-h-[calc(90vh-5rem)] max-w-full w-auto h-auto object-contain mx-auto xl:pt-4"
                      unoptimized
                    />
                  ) : photo.thumbnailUrl ? (
                    <Image
                      src={photo.thumbnailUrl}
                      alt={photo.filename}
                      width={photo.width ?? 1200}
                      height={photo.height ?? 800}
                      className="max-h-[calc(90vh-5rem)] max-w-full w-auto h-auto object-contain mx-auto xl:pt-4"
                      unoptimized
                    />
                  ) : null}
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2 bg-white/20 border-white/40 text-white hover:bg-white/40 hover:text-white" />
            <CarouselNext className="right-2 bg-white/20 border-white/40 text-white hover:bg-white/40 hover:text-white" />
          </Carousel>
        </div>

        <div className="h-16 shrink-0 flex items-center justify-between gap-2 text-sm text-white/70 px-6">
          {currentPhoto && (
            <div className="flex gap-2">
              <span>{currentPhoto.filename}</span>
              {currentPhoto.size != null && (
                <span>
                  · {(currentPhoto.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              )}
              {currentPhoto.createdAt && (
                <span>
                  ·{" "}
                  {new Date(currentPhoto.createdAt).toLocaleDateString(
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
                <DropdownMenuItem onClick={() => setIsDownloadOpen(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
                {!currentAlbum && (
                  <DropdownMenuItem onClick={() => setIsAddToAlbumOpen(true)}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add to Album
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <AddToAlbumModal
          isOpen={isAddToAlbumOpen}
          onClose={() => setIsAddToAlbumOpen(false)}
          photo={currentPhoto ?? null}
        />
        {currentPhoto && (
          <DownloadModal
            isOpen={isDownloadOpen}
            onClose={() => setIsDownloadOpen(false)}
            photos={[currentPhoto]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
