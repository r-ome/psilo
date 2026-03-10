"use client";

import { useEffect, useState } from "react";
import { photoService, StorageSize } from "@/app/lib/services/photo.service";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export default function StoragePage() {
  const [storageData, setStorageData] = useState<StorageSize | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStorageSize = async () => {
      try {
        setLoading(true);
        const data = await photoService.getStorageSize();
        setStorageData(data);
        setError(null);
      } catch (err) {
        setError("Failed to load storage information");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStorageSize();
  }, []);

  const standardSizeGB = (storageData?.standardSize ?? 0) / 1024 ** 3;
  const glacierSizeGB = (storageData?.glacierSize ?? 0) / 1024 ** 3;
  const standardCount = storageData?.standardCount ?? 0;

  const standardCost = standardSizeGB * 0.025; // $0.025/GB/month
  const glacierCost = glacierSizeGB * 0.0045; // $0.0045/GB/month
  const transitionCost = (standardCount / 1000) * 0.03; // $0.03 per 1000 transitions
  const totalCost = standardCost + glacierCost + transitionCost;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Storage</h1>

        {loading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-gray-500">Loading storage information...</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-red-500">{error}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Standard Storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">
                    {standardSizeGB.toFixed(2)} GB
                  </p>
                  <p className="text-gray-500 mt-2">
                    ${standardCost.toFixed(6)} per month
                  </p>
                  <p className="text-sm text-gray-400 mt-1">$0.025/GB/month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Glacier Archive</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">
                    {glacierSizeGB.toFixed(2)} GB
                  </p>
                  <p className="text-gray-500 mt-2">
                    ${glacierCost.toFixed(6)} per month
                  </p>
                  <p className="text-sm text-gray-400 mt-1">$0.0045/GB/month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Transition Fees</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">
                    {standardCount.toLocaleString()} Objects
                  </p>
                  <p className="text-gray-500 mt-2">
                    ${transitionCost.toFixed(6)} one-time
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    $0.03 per 1000 objects
                  </p>
                </CardContent>
              </Card>

              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle>Total Estimated Cost</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold">${totalCost.toFixed(6)}</p>
                  <p className="text-gray-500 mt-2">Estimated total</p>
                  <p className="text-sm text-gray-400 mt-3">
                    Includes ${standardCost.toFixed(6)}/month storage + $
                    {transitionCost.toFixed(6)} one-time transition
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
