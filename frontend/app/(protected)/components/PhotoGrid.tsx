"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  Check,
  Fullscreen,
  Trash2,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  Play,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
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
  viewMode?: "grid" | "large";
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

const GRID_CLASSES = {
  grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  large: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
};

export default function PhotoGrid({
  photos,
  selectedIds,
  onToggleSelect,
  onDeleteRequest,
  onPhotoClick,
  onRetry,
  viewMode = "grid",
}: PhotoGridProps) {
  const groupedPhotos = useMemo(() => groupPhotosByDate(photos), [photos]);

  return (
    <div className="flex flex-col gap-6">
      {groupedPhotos.map((item) => {
        return (
          <div className="flex flex-col gap-3" key={item.date}>
            <h2 className="text-sm font-medium text-muted-foreground">
              {formatDate(item.date, "E MMM d, yyyy")}
            </h2>
            <div className={cn("grid gap-2", GRID_CLASSES[viewMode])}>
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
                      "group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-secondary transition-all",
                      isSelected &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[0.96]",
                    )}
                    onClick={() => {
                      if (!isCompleted) return;
                      onPhotoClick(photos.indexOf(photo));
                    }}
                    onContextMenu={(e) => {
                      if (!isCompleted) return;
                      e.preventDefault();
                      onToggleSelect(photo);
                    }}
                    onMouseEnter={(e) => {
                      if (!isVideo) return;
                      const video = e.currentTarget.querySelector("video");
                      video?.play().catch(() => {});
                    }}
                    onMouseLeave={(e) => {
                      if (!isVideo) return;
                      const video = e.currentTarget.querySelector("video");
                      if (video) {
                        video.pause();
                        video.currentTime = 0;
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
                                className="object-cover transition-transform group-hover:scale-105"
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                              />
                              {photo.previewUrl && (
                                <video
                                  muted
                                  loop
                                  playsInline
                                  preload="metadata"
                                  className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                >
                                  <source
                                    src={photo.previewUrl}
                                    type="video/mp4"
                                  />
                                </video>
                              )}
                            </>
                          ) : null
                        ) : photo.thumbnailUrl ? (
                          <Image
                            src={photo.thumbnailUrl!}
                            alt={photo.filename}
                            fill
                            className="object-cover transition-transform group-hover:scale-105"
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                          />
                        ) : null}

                        {/* Fullscreen overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                          <Fullscreen className="h-5 w-5 text-white drop-shadow" />
                        </div>
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
                        <span className="text-xs text-destructive">Failed</span>
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

                    {/* Selection checkbox */}
                    {isCompleted && (
                      <div
                        className={cn(
                          "absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border-2 transition-all z-10 cursor-pointer",
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-foreground/50 bg-background/50 opacity-0 group-hover:opacity-100",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(photo);
                        }}
                      >
                        {isSelected && (
                          <Check className="size-4 text-primary-foreground" />
                        )}
                      </div>
                    )}

                    {/* Video indicator */}
                    {isCompleted && isVideo && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-xs font-medium">
                        <Play className="size-3 fill-current" />
                        Video
                      </div>
                    )}

                    {/* Actions dropdown menu */}
                    {isCompleted && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-2 size-7 opacity-0 group-hover:opacity-100 bg-background/50 hover:bg-background/80"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onPhotoClick(photos.indexOf(photo));
                            }}
                          >
                            <Fullscreen className="mr-2 size-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {onDeleteRequest && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest(photo);
                              }}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}


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
