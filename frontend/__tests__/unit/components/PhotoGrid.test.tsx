import type React from "react";
import { fireEvent, render } from "@testing-library/react";
import PhotoGrid from "@/app/(protected)/components/PhotoGrid";
import type { Photo } from "@/app/lib/services/photo.service";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

vi.mock("@/app/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/app/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
  }) => <div onClick={onClick}>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("PhotoGrid", () => {
  const basePhoto: Photo = {
    id: "photo-1",
    userId: "u1",
    s3Key: "users/u1/photos/photo.jpg",
    thumbnailKey: null,
    previewKey: null,
    filename: "photo.jpg",
    size: 123,
    width: null,
    height: null,
    format: "heic",
    contentType: "image/heic",
    status: "completed",
    storageClass: "STANDARD",
    createdAt: "2026-04-09T00:00:00.000Z",
    takenAt: null,
    deletedAt: null,
    thumbnailUrl: null,
    previewUrl: null,
    signedUrl: "https://example.com/photo.jpg",
  };

  it("shows an original-only placeholder when a completed image has no derivatives", () => {
    const { getByText } = render(
      <PhotoGrid
        photos={[basePhoto]}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onPhotoClick={vi.fn()}
      />,
    );

    expect(getByText("Original only")).toBeInTheDocument();
  });

  it("calls retry for failed photos", () => {
    const onRetry = vi.fn();
    const failedPhoto: Photo = {
      ...basePhoto,
      id: "photo-2",
      status: "failed",
      contentType: "image/jpeg",
      format: "jpeg",
      signedUrl: undefined,
    };

    const { getByText } = render(
      <PhotoGrid
        photos={[failedPhoto]}
        selectedIds={new Set()}
        onToggleSelect={vi.fn()}
        onPhotoClick={vi.fn()}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(getByText("Retry"));

    expect(onRetry).toHaveBeenCalledWith(failedPhoto);
  });
});
