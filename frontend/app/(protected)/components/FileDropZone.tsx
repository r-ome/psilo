"use client";

import { useEffect, useRef } from "react";
import { FolderUp, Upload } from "lucide-react";
import { useUpload } from "@/app/context/UploadContext";

interface FileDropZoneProps {
  onFilesAccepted?: () => void;
}

const FileDropZone: React.FC<FileDropZoneProps> = ({ onFilesAccepted }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const takeoutInputRef = useRef<HTMLInputElement>(null);
  const { startUpload, startGoogleTakeoutUpload } = useUpload();

  useEffect(() => {
    const input = takeoutInputRef.current;
    if (!input) return;

    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles = Array.from(files);
    if (validFiles.length === 0) return;

    startUpload(validFiles);
    onFilesAccepted?.();
  };

  const handleGoogleTakeoutSelect = (files: FileList | null) => {
    if (!files) return;

    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    startGoogleTakeoutUpload(selectedFiles);
    onFilesAccepted?.();
  };

  const handleBoxClick = () => {
    fileInputRef.current?.click();
  };

  const handleTakeoutClick = () => {
    takeoutInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className="px-6">
      <div className="grid gap-4">
        <div
          className="border-2 border-dashed border-border rounded-md p-8 flex flex-col items-center justify-center text-center cursor-pointer"
          onClick={handleBoxClick}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="mb-2 bg-muted rounded-full p-3">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Upload photos or videos
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Drag files here or{" "}
            <label
              htmlFor="fileUpload"
              className="text-primary hover:text-primary/90 font-medium cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              click to browse
            </label>
          </p>
          <input
            type="file"
            id="fileUpload"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,video/*"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>

        <button
          type="button"
          className="rounded-md border border-border bg-muted/40 p-4 text-left transition-colors hover:bg-muted"
          onClick={handleTakeoutClick}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-background p-2">
              <FolderUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Import from Google Photos Takeout
              </p>
              <p className="text-sm text-muted-foreground">
                Select an extracted Takeout folder. Matching JSON sidecars will
                be uploaded and used as the source of truth for photo dates.
              </p>
            </div>
          </div>
          <input
            type="file"
            ref={takeoutInputRef}
            className="hidden"
            multiple
            onChange={(e) => handleGoogleTakeoutSelect(e.target.files)}
          />
        </button>
      </div>
    </div>
  );
};

export default FileDropZone;
