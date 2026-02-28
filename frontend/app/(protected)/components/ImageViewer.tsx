"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle } from "@/app/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/app/components/ui/carousel";
import { Photo } from "@/app/lib/services/photo.service";

interface ImageViewerProps {
  photos: Photo[];
  initialIndex: number | null;
  onClose: () => void;
}

export default function ImageViewer({
  photos,
  initialIndex,
  onClose,
}: ImageViewerProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);

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
      else if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [api, initialIndex, onClose]);

  const currentPhoto = photos[currentIndex];

  return (
    <Dialog
      open={initialIndex !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] p-0 bg-black border-0 flex flex-col overflow-hidden text-white">
        <DialogTitle className="sr-only">Image viewer</DialogTitle>

        {/* Image area */}
        <div className="flex-1 min-h-0 relative">
          <Carousel setApi={setApi} className="w-full h-full">
            <CarouselContent>
              {photos.map((photo) => (
                <CarouselItem
                  key={photo.id}
                  className="flex items-center justify-center p-8"
                >
                  <Image
                    src={photo.signedUrl}
                    alt={photo.filename}
                    width={photo.width ?? 1200}
                    height={photo.height ?? 800}
                    className="max-h-[calc(90vh-5rem)] max-w-full w-auto h-auto object-contain"
                    unoptimized
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="left-2 bg-white/20 border-white/40 text-white hover:bg-white/40 hover:text-white" />
            <CarouselNext className="right-2 bg-white/20 border-white/40 text-white hover:bg-white/40 hover:text-white" />
          </Carousel>
        </div>

        {/* Details bar */}
        <div className="h-16 flex-shrink-0 flex items-center justify-center gap-2 text-sm text-white/70 px-6">
          {currentPhoto && (
            <>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
