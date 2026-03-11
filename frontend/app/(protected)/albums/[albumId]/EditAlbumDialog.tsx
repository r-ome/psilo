"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Album } from "@/app/lib/services/album.service";

interface EditAlbumDialogProps {
  album: Album | null;
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
}

export default function EditAlbumDialog({
  album,
  onConfirm,
  onCancel,
}: EditAlbumDialogProps) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (album) {
      setValue(album.name);
    }
  }, [album]);

  const isOpen = album !== null;
  const isUnchanged = value === album?.name;
  const isEmpty = !value.trim();

  const handleSubmit = async () => {
    if (isEmpty || isUnchanged) return;
    setIsSaving(true);
    try {
      await onConfirm(value);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Album Name</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Album name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isSaving}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isEmpty || isUnchanged || isSaving}
          >
            {isSaving && <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
