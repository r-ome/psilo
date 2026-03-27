import Link from "next/link";
import { RotateCcw, Clock, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { RetrievalBatch } from "@/app/lib/services/retrieval.service";

interface RestoreRequestsCardProps {
  batches: RetrievalBatch[];
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RestoreRequestsCard({ batches }: RestoreRequestsCardProps) {
  const pendingCount = batches.filter(
    (b) => b.status === "PENDING" || b.status === "IN_PROGRESS",
  ).length;
  const completedCount = batches.filter(
    (b) => b.status === "COMPLETED" || b.status === "AVAILABLE",
  ).length;
  const lastBatch = [...batches].sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  )[0];
  const lastRequestLabel = lastBatch
    ? timeAgo(new Date(lastBatch.requestedAt))
    : "None";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="size-5" />
              Restore Requests
            </CardTitle>
            <CardDescription>
              Summary of your Glacier restore requests
            </CardDescription>
          </div>
          <Button variant="outline" asChild>
            <Link href="/restore-requests">View All</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-lg bg-secondary p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-chart-4/20">
              <Clock className="size-5 text-chart-4" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-lg bg-secondary p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/20">
              <TrendingUp className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completedCount}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-lg bg-secondary p-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-chart-5/20">
              <RotateCcw className="size-5 text-chart-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Last Request</p>
              <p className="text-sm text-muted-foreground">
                {lastRequestLabel}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
