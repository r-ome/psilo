import { useEffect, useRef } from "react";

interface UseLoadMoreOptions {
  nextCursor: string | null;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  isOpen?: boolean;
}

export function useLoadMore({
  nextCursor,
  isLoadingMore,
  onLoadMore,
  scrollContainerRef,
  isOpen,
}: UseLoadMoreOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    // Defer observer setup to next frame to ensure DOM is ready
    const timeoutId = requestAnimationFrame(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && nextCursor && !isLoadingMore) {
            onLoadMore();
          }
        },
        {
          root: scrollContainerRef?.current ?? null,
          threshold: 0.1,
        },
      );

      observer.observe(el);

      return () => observer.disconnect();
    });

    return () => cancelAnimationFrame(timeoutId);
  }, [nextCursor, isLoadingMore, onLoadMore, isOpen]);

  return sentinelRef;
}
