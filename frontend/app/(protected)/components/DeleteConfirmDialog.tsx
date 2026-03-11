import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { Photo } from "@/app/lib/services/photo.service";

interface DeleteConfirmDialogProps {
  photo?: Photo | null;
  bulkCount?: number | null;
  customTitle?: string;
  customDescription?: string;
  customActionLabel?: string;
  isDangerous?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export default function DeleteConfirmDialog({
  photo = null,
  bulkCount = null,
  customTitle,
  customDescription,
  customActionLabel = "Delete",
  isDangerous = true,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const isBulk = bulkCount !== null && bulkCount > 0;
  const isOpen = photo !== null || isBulk || (customTitle !== undefined && customDescription !== undefined);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
  };

  const title = customTitle ?? (isBulk
    ? `Delete ${bulkCount} photo${bulkCount === 1 ? "" : "s"}?`
    : "Delete photo?");

  const description = customDescription ?? (isBulk
    ? `Are you sure you want to delete ${bulkCount} photo${bulkCount === 1 ? "" : "s"}? This action cannot be undone.`
    : `Are you sure you want to delete "${photo?.filename}"? This action cannot be undone.`);

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isDeleting) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={isDangerous ? "bg-destructive text-white hover:bg-destructive/90" : ""}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {customActionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
