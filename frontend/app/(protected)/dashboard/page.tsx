import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import FileDropZone from "@/app/(protected)/components/FileDropZone";

export default function Page() {
  return (
    <div className="w-1/3">
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Files</CardTitle>
        </CardHeader>
        <CardContent>
          <FileDropZone />
        </CardContent>
      </Card>
    </div>
  );
}
