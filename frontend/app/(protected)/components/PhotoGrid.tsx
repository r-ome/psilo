"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  Check,
  Fullscreen,
  Trash2,
  Loader2,
  AlertCircle,
  Search,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { GroupedPhotosByDate, Photo } from "@/app/lib/services/photo.service";
import { cn, formatDate } from "@/app/lib/utils";

interface PhotoGridProps {
  photos: Photo[];
  selectedIds: Set<string>;
  onToggleSelect: (photo: Photo) => void;
  onDeleteRequest?: (photo: Photo) => void;
  onPhotoClick: (index: number) => void;
  onRetry?: (photo: Photo) => void;
  onUpdateRequest?: (photo: Photo) => void;
  selectMode?: boolean;
}

function groupPhotosByDate(photos: Photo[]): GroupedPhotosByDate[] {
  return Object.entries(
    photos.reduce<Record<string, Photo[]>>((acc, item) => {
      const sourceDate = item.takenAt ?? item.createdAt;
      const date = sourceDate ? sourceDate.split("T")[0] : "unknown";

      if (!acc[date]) acc[date] = [];
      acc[date].push(item);

      return acc;
    }, {}),
  )
    .sort((a, b) => {
      if (a[0] === "unknown") return 1;
      if (b[0] === "unknown") return -1;
      return new Date(b[0]).getTime() - new Date(a[0]).getTime();
    })
    .map(([date, photos]) => ({ date, photos }));
}

export default function PhotoGrid({
  photos,
  selectedIds,
  onToggleSelect,
  onDeleteRequest,
  onPhotoClick,
  onRetry,
  selectMode = false,
}: PhotoGridProps) {
  const groupedPhotos = useMemo(() => groupPhotosByDate(photos), [photos]);

  return (
    <div className="flex flex-col gap-4">
      {groupedPhotos.map((item) => {
        return (
          <div className="flex flex-col gap-4" key={item.date}>
            <div className="font-semibold">
              {formatDate(item.date, "E MMM d, yyyy")}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
              {item.photos.map((photo) => {
                const isSelected = selectedIds.has(photo.id);
                const isCompleted = photo.status === "completed";
                const isFailed = photo.status === "failed";
                const isProcessing =
                  photo.status === "pending" || photo.status === "processing";
                const isVideo = photo.contentType?.startsWith("video/");

                return (
                  <div
                    key={photo.id}
                    className={cn(
                      "relative group border overflow-hidden",
                      isSelected ? "" : "border-border",
                    )}
                  >
                    <div
                      className={cn(
                        "relative aspect-square bg-muted transition-transform duration-200",
                        isSelected && isCompleted ? "scale-90" : "",
                        isCompleted && !selectMode
                          ? "cursor-pointer"
                          : isCompleted && selectMode
                            ? "cursor-pointer"
                            : "cursor-default",
                      )}
                      onClick={() => {
                        if (!isCompleted) return;
                        if (selectMode) {
                          onToggleSelect(photo);
                        } else {
                          onPhotoClick(photos.indexOf(photo));
                        }
                      }}
                    >
                      {isCompleted ? (
                        <>
                          {isVideo ? (
                            photo.thumbnailUrl ? (
                              <>
                                <Image
                                  src={photo.thumbnailUrl}
                                  alt={photo.filename}
                                  fill
                                  className="object-cover"
                                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                                />
                                {photo.previewUrl && (
                                  <video
                                    muted
                                    loop
                                    playsInline
                                    preload="metadata"
                                    className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                    onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.pause();
                                      e.currentTarget.currentTime = 0;
                                    }}
                                  >
                                    <source src={photo.previewUrl} type="video/mp4" />
                                  </video>
                                )}
                              </>
                            ) : null
                          ) : photo.thumbnailUrl ? (
                            <Image
                              src={photo.thumbnailUrl!}
                              alt={photo.filename}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 16vw"
                            />
                          ) : null}
                          {!selectMode ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                              <Fullscreen className="h-5 w-5 text-white drop-shadow" />
                            </div>
                          ) : null}
                        </>
                      ) : isProcessing ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                          <span className="text-xs text-muted-foreground capitalize">
                            {photo.status}
                          </span>
                        </div>
                      ) : isFailed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                          <AlertCircle className="h-6 w-6 text-destructive" />
                          <span className="text-xs text-destructive">
                            Failed
                          </span>
                          {onRetry && (
                            <button
                              className="text-xs underline text-muted-foreground hover:text-foreground hover:cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetry(photo);
                              }}
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      ) : null}
                      {isCompleted && (
                        <button
                          className={cn(
                            "absolute top-1 left-1 h-5 w-5 rounded-full flex items-center justify-center transition-opacity z-10 cursor-pointer",
                            selectMode
                              ? isSelected
                                ? "opacity-100 bg-primary"
                                : "opacity-100 bg-black/40 border border-white"
                              : isSelected
                                ? "opacity-100 bg-primary"
                                : "opacity-0 group-hover:opacity-100 bg-black/40 border border-white",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelect(photo);
                          }}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </button>
                      )}

                      {isCompleted && onDeleteRequest && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-background/80 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRequest(photo);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}

                      {selectMode && isCompleted && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPhotoClick(photos.indexOf(photo));
                          }}
                          className="absolute bottom-2 right-1 -translate-x-1/2 bg-black/60 rounded-full p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                        >
                          <Search className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
