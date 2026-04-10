import { render, screen } from "@testing-library/react";
import ImageViewer from "@/app/(protected)/components/ImageViewer";
import type { Photo } from "@/app/lib/services/photo.service";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/app/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/app/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock("@/app/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/app/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselNext: () => null,
  CarouselPrevious: () => null,
}));

vi.mock("@/app/lib/video-playback", () => ({
  getPreferredVideoPlaybackSource: vi.fn(() => null),
}));

vi.mock("@/app/lib/photo-versions", () => ({
  getRelatedPhotoVersions: vi.fn(() => []),
  isEditedPhotoVersion: vi.fn(() => false),
}));

vi.mock("@/app/(protected)/components/AddToAlbumModal", () => ({
  default: () => null,
}));

vi.mock("@/app/(protected)/components/DownloadModal", () => ({
  default: () => null,
}));

describe("ImageViewer", () => {
  const basePhoto: Photo = {
    id: "photo-1",
    userId: "user-1",
    s3Key: "users/user-1/photos/test.HEIC",
    thumbnailKey: "users/user-1/thumbnails/test.jpg",
    previewKey: "users/user-1/previews/test.jpg",
    filename: "test.HEIC",
    size: 1024,
    width: 1200,
    height: 800,
    format: "heic",
    contentType: "image/heic",
    status: "completed",
    storageClass: "STANDARD",
    createdAt: "2026-04-10T00:00:00.000Z",
    takenAt: "2026-04-10T00:00:00.000Z",
    thumbnailUrl: "https://example.com/thumb.jpg",
    previewUrl: "https://example.com/preview.jpg",
    signedUrl: "https://example.com/original.HEIC",
  };

  it("prefers preview assets over the raw HEIC original", () => {
    render(
      <ImageViewer
        photos={[basePhoto]}
        initialIndex={0}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByAltText("test.HEIC")).toHaveAttribute(
      "src",
      "https://example.com/preview.jpg",
    );
  });
});
