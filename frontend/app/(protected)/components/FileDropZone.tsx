"use client";
import { useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { s3Service } from "@/app/lib/services/s3.service";

const FileDropZone: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileProgresses, setFileProgresses] = useState<Record<string, number>>(
    {},
  );

  const uploadFile = async (file: File) => {
    const { url } = await s3Service.getPresignedURL({
      filename: file.name,
      contentType: file.type,
    });
    await s3Service.uploadToS3(url, file, (percent) =>
      setFileProgresses((prev) => ({ ...prev, [file.name]: percent })),
    );
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    setUploadedFiles((prev) => [...prev, ...newFiles]);
    newFiles.forEach(uploadFile);
  };

  const handleBoxClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (filename: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.name !== filename));
    setFileProgresses((prev) => {
      const newProgresses = { ...prev };
      delete newProgresses[filename];
      return newProgresses;
    });
  };

  return (
    <>
      <div className="px-6">
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
            Upload a project image
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or,{" "}
            <label
              htmlFor="fileUpload"
              className="text-primary hover:text-primary/90 font-medium cursor-pointer"
              onClick={(e) => e.stopPropagation()} // Prevent triggering handleBoxClick
            >
              click to browse
            </label>{" "}
            (4MB max)
          </p>
          <input
            type="file"
            id="fileUpload"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
      </div>
      <div
        className={cn(
          "px-6 pb-5 space-y-3",
          uploadedFiles.length > 0 ? "mt-4" : "",
        )}
      >
        {uploadedFiles.map((file, index) => {
          const imageUrl = URL.createObjectURL(file);

          return (
            <div
              className="border border-border rounded-lg p-2 flex flex-col"
              key={file.name + index}
              onLoad={() => {
                return () => URL.revokeObjectURL(imageUrl);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-18 h-14 bg-muted rounded-sm flex items-center justify-center self-start row-span-2 overflow-hidden">
                  <img
                    src={imageUrl}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 pr-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate max-w-62.5">
                        {file.name}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {Math.round(file.size / 1024)} KB
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="bg-transparent! hover:text-red-500"
                      onClick={() => removeFile(file.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden flex-1">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${fileProgresses[file.name] || 0}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {Math.round(fileProgresses[file.name] || 0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default FileDropZone;
