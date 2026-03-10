"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import DeleteConfirmDialog from "@/app/(protected)/components/DeleteConfirmDialog";
import { albumService, Album } from "@/app/lib/services/album.service";
import { formatDate } from "@/app/lib/utils";

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [albumToDelete, setAlbumToDelete] = useState<Album | null>(null);

  useEffect(() => {
    albumService
      .listAlbums()
      .then(setAlbums)
      .catch(() => {});
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

  return (
    <div className="space-y-6">
      <div>
        <Button onClick={() => setDialogOpen(true)}>Create Album</Button>
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
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <h2 className="text-lg font-semibold mb-4">Your Albums</h2>
        {albums.length === 0 ? (
          <p className="text-sm text-muted-foreground">No albums yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {albums.map((album) => (
              <Link key={album.id} href={`/albums/${album.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden pt-0 gap-0 hover:shadow-lg">
                  <div className="relative w-full aspect-square bg-muted flex items-center justify-center">
                    <button
                      className="absolute top-2 left-2 z-10 p-1.5 rounded-full bg-background/80 hover:bg-destructive hover:text-white transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setAlbumToDelete(album);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {album.coverUrl ? (
                      <Image
                        src={album.coverUrl}
                        alt={album.name}
                        width={400}
                        height={400}
                        className="w-full h-full object-cover"
                      />
                    ) : (
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
                    )}
                  </div>
                  <CardContent className="pt-3">
                    <p className="font-medium truncate">{album.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {album.createdAt
                        ? formatDate(
                            new Date(album.createdAt).toLocaleDateString(),
                          )
                        : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

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
