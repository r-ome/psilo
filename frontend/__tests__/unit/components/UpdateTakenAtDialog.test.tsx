import { render, screen } from "@testing-library/react";
import UpdateTakenAtDialog from "@/app/(protected)/components/UpdateTakenAtDialog";
import type { Photo } from "@/app/lib/services/photo.service";

const basePhoto = (overrides: Partial<Photo> = {}): Photo =>
  ({
    id: "photo-1",
    userId: "user-1",
    s3Key: "users/user-1/photos/photo.jpg",
    thumbnailKey: null,
    filename: "photo.jpg",
    size: 123,
    width: null,
    height: null,
    format: null,
    contentType: "image/jpeg",
    status: "completed",
    storageClass: "STANDARD",
    createdAt: "2024-01-01T10:00:00.000Z",
    takenAt: "2024-01-02T10:00:00.000Z",
    deletedAt: null,
    thumbnailUrl: null,
    ...overrides,
  }) as Photo;

describe("UpdateTakenAtDialog", () => {
  it("resets the date when a different photo is opened", () => {
    const { rerender } = render(
      <UpdateTakenAtDialog
        photo={basePhoto({ id: "photo-1", takenAt: "2024-01-02T10:00:00.000Z" })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("2024-01-02")).toBeInTheDocument();

    rerender(
      <UpdateTakenAtDialog
        photo={basePhoto({ id: "photo-2", takenAt: "2024-02-03T10:00:00.000Z" })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("2024-02-03")).toBeInTheDocument();
  });
});
