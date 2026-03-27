interface StorageProgressBarProps {
  standardSizeGB: number;
  glacierSizeGB: number;
  totalSizeGB: number;
}

export function StorageProgressBar({
  standardSizeGB,
  glacierSizeGB,
  totalSizeGB,
}: StorageProgressBarProps) {
  if (totalSizeGB === 0) {
    return <div className="h-4 rounded-full bg-secondary" />;
  }

  const standardPct = (standardSizeGB / totalSizeGB) * 100;
  const glacierPct = (glacierSizeGB / totalSizeGB) * 100;

  return (
    <div className="relative h-4 overflow-hidden rounded-full bg-secondary">
      <div
        className="absolute inset-y-0 left-0 bg-primary transition-all"
        style={{ width: `${standardPct}%` }}
      />
      <div
        className="absolute inset-y-0 bg-chart-2 transition-all"
        style={{
          left: `${standardPct}%`,
          width: `${glacierPct}%`,
        }}
      />
    </div>
  );
}
