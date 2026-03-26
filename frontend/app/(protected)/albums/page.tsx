"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2Icon,
} from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import { albumService, Album } from "@/app/lib/services/album.service";

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<Album | null>(null);
  const [albumToRename, setAlbumToRename] = useState<Album | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    albumService
      .listAlbums()
      .then(setAlbums)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newAlbumName.trim()) return;
    setCreating(true);
    try {
      const album = await albumService.createAlbum(newAlbumName.trim());
      setAlbums((prev) => [...prev, album]);
      setNewAlbumName("");
      setDialogOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!albumToDelete) return;
    await albumService.deleteAlbum(albumToDelete.id);
    setAlbums((prev) => prev.filter((a) => a.id !== albumToDelete.id));
    setAlbumToDelete(null);
  };

  const handleRename = async () => {
    if (!albumToRename || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const updated = await albumService.updateAlbum(
        albumToRename.id,
        renameValue.trim(),
      );
      setAlbums((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, name: updated.name } : a)),
      );
      setAlbumToRename(null);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Albums</h1>
          <p className="text-sm text-muted-foreground">
            {albums.length} album{albums.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New Album
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Album</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Album name"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <Button
              onClick={handleCreate}
              disabled={creating || !newAlbumName.trim()}
            >
              {creating && (
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={albumToRename !== null}
        onOpenChange={(open) => !open && setAlbumToRename(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Album</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Album name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
            <Button
              onClick={handleRename}
              disabled={renaming || !renameValue.trim()}
            >
              {renaming && (
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center items-center py-16">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : albums.length === 0 ? (
        <p className="text-sm text-muted-foreground">No albums yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {albums.map((album) => (
            <Card
              key={album.id}
              className="group overflow-hidden border-border bg-card transition-colors hover:bg-secondary/50 pt-0 gap-0"
            >
              <Link href={`/albums/${album.id}`}>
                <div className="relative aspect-square bg-muted overflow-hidden">
                  {album.coverUrls.length >= 4 ? (
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
                      {album.coverUrls.slice(0, 4).map((src, index) => (
                        <div key={index} className="relative overflow-hidden">
                          <Image
                            src={src}
                            alt=""
                            fill
                            className="object-cover transition-transform group-hover:scale-105"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 12.5vw"
                          />
                        </div>
                      ))}
                    </div>
                  ) : album.coverUrls.length > 0 ? (
                    <Image
                      src={album.coverUrls[0]}
                      alt={album.name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </Link>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <Link href={`/albums/${album.id}`} className="min-w-0 flex-1">
                    <h3 className="font-medium leading-none truncate">
                      {album.name}
                    </h3>
                    {album.createdAt && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {new Date(album.createdAt).toLocaleDateString()}
                      </p>
                    )}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameValue(album.name);
                          setAlbumToRename(album);
                        }}
                      >
                        <Pencil className="mr-2 size-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setAlbumToDelete(album)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {albumToDelete && (
        <DeleteConfirmDialog
          customTitle="Delete album?"
          customDescription={`"${albumToDelete.name}" will be deleted. Photos inside will not be affected.`}
          onConfirm={handleDeleteAlbum}
          onCancel={() => setAlbumToDelete(null)}
        />
      )}
    </div>
  );
}
