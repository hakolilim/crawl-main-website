import JSZip from "jszip";
import { formatFilename } from "@/lib/hako/utils";

export async function packageDownloadsZip(
  novelTitle: string,
  files: Array<{ filename: string; blob: Blob }>,
): Promise<{ filename: string; blob: Blob }> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.blob);
  }
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  });
  return {
    filename: `${formatFilename(novelTitle)}-downloads.zip`,
    blob,
  };
}
