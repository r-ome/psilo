"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { albumService, Album } from "@/app/lib/services/album.service";
import { Photo } from "@/app/lib/services/photo.service";

interface AddToAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  photo: Photo | null;
}

export default function AddToAlbumModal({
  isOpen,
  onClose,
  photo,
}: AddToAlbumModalProps) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const loadAlbums = async () => {
      setLoading(true);
      try {
        const data = await albumService.listAlbums();
        setAlbums(data);
        setSearch("");
        setSelectedAlbumId(null);
      } catch {
        toast.error("Failed to load albums");
      } finally {
        setLoading(false);
      }
    };

    loadAlbums();
  }, [isOpen]);

  const filteredAlbums = albums.filter((album) =>
    album.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSubmit = async () => {
    if (!selectedAlbumId || !photo) return;

    setSubmitting(true);
    try {
      await albumService.addPhotoToAlbum(selectedAlbumId, photo.id);
      toast.success("Photo added to album");
      onClose();
    } catch {
      toast.error("Failed to add photo to album");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Album</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Search albums..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading albums...
            </div>
          ) : filteredAlbums.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {albums.length === 0
                ? "No albums found. Create one first."
                : "No albums match your search."}
            </div>
          ) : (
            <div className="border rounded max-h-60 overflow-y-auto">
              {filteredAlbums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  className={`w-full px-4 py-3 text-left border-b last:border-b-0 transition-colors ${
                    selectedAlbumId === album.id
                      ? "bg-accent"
                      : "hover:bg-muted"
                  }`}
                >
                  {album.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedAlbumId || submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add to Album
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
