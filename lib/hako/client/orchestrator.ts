import {
  exportVolumeDocx,
  exportVolumeEpub,
  exportVolumeTxt,
  packageDownloadsZip,
} from "@/lib/hako/export";
import { randomDelay, sleep } from "@/lib/hako/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  ChapterPayload,
  ExportFormat,
  NovelData,
  VolumeInfo,
} from "@/lib/types";

export type GeneratedFile = {
  filename: string;
  blob: Blob;
  format: string;
  objectUrl: string;
  storagePath?: string;
  id?: string;
};

export type OrchestratorCallbacks = {
  onLog?: (message: string) => void;
  onProgress?: (progress: number, message: string) => void;
};

async function apiJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export async function runDownloadJob(options: {
  novel: NovelData;
  selectedVolumeIds: number[];
  exportFormats: ExportFormat[];
  userId: string;
  callbacks?: OrchestratorCallbacks;
}): Promise<GeneratedFile[]> {
  const { novel, selectedVolumeIds, exportFormats, userId, callbacks } =
    options;
  const log = (msg: string) => callbacks?.onLog?.(msg);
  const progress = (p: number, msg: string) =>
    callbacks?.onProgress?.(Math.min(Math.max(p, 0), 1), msg);

  const volumes = (novel.volumes || []).filter((v) =>
    selectedVolumeIds.includes(v.id),
  );
  if (!volumes.length) {
    throw new Error("Bạn chưa chọn tập hợp lệ để tải.");
  }

  const formats =
    exportFormats.length > 0
      ? exportFormats
      : (["epub"] as ExportFormat[]);

  const supabase = createClient();
  const { data: job, error: jobError } = await supabase
    .from("download_jobs")
    .insert({
      user_id: userId,
      novel_id: novel.id || null,
      selected_volume_ids: selectedVolumeIds,
      export_formats: formats,
      status: "running",
      progress: 0,
      current_message: "Chuẩn bị tải truyện...",
      logs: "",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(jobError?.message || "Không tạo được job tải.");
  }

  const jobId = job.id as string;
  let logs = "";
  const appendLog = async (message: string) => {
    logs = logs ? `${logs}\n${message}` : message;
    log(message);
    await supabase
      .from("download_jobs")
      .update({
        logs,
        current_message: message,
      })
      .eq("id", jobId);
  };

  const totalChapters =
    volumes.reduce((sum, v) => sum + (v.chapters?.length || 0), 0) || 1;
  let completed = 0;

  const createdFiles: GeneratedFile[] = [];
  const volumeFiles: Array<{ filename: string; blob: Blob }> = [];

  try {
    progress(0.01, "Chuẩn bị tải truyện...");
    await appendLog("Chuẩn bị tải truyện...");

    for (const volume of volumes) {
      await appendLog(`Bắt đầu tải tập: ${volume.title}`);
      progress(
        Math.min(completed / totalChapters, 0.05),
        `Bắt đầu tải tập: ${volume.title}`,
      );

      const chaptersData: ChapterPayload[] = [];
      const chapters = volume.chapters || [];

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        const idx = i + 1;
        await appendLog(
          `Tải chương ${idx}/${chapters.length}: ${chapter.title}`,
        );

        const result = await apiJson<{ chapter: ChapterPayload }>(
          "/api/hako/fetch-chapter",
          {
            url: chapter.url,
            title: chapter.title,
            chapterIndex: idx,
          },
        );
        chaptersData.push(result.chapter);
        completed += 1;
        progress(
          Math.min(completed / totalChapters, 0.95),
          `Tải chương ${idx}/${chapters.length}: ${chapter.title}`,
        );

        if (idx < chapters.length) {
          await sleep(randomDelay());
        }
      }

      if (formats.includes("txt")) {
        const file = exportVolumeTxt(volume, novel, chaptersData);
        volumeFiles.push(file);
        createdFiles.push({
          ...file,
          format: "txt",
          objectUrl: URL.createObjectURL(file.blob),
        });
        await appendLog(`Đã tạo TXT: ${file.filename}`);
      }
      if (formats.includes("docx")) {
        const file = await exportVolumeDocx(volume, novel, chaptersData);
        volumeFiles.push(file);
        createdFiles.push({
          ...file,
          format: "docx",
          objectUrl: URL.createObjectURL(file.blob),
        });
        await appendLog(`Đã tạo DOCX: ${file.filename}`);
      }
      if (formats.includes("epub")) {
        const file = await exportVolumeEpub(volume, novel, chaptersData);
        volumeFiles.push(file);
        createdFiles.push({
          ...file,
          format: "epub",
          objectUrl: URL.createObjectURL(file.blob),
        });
        await appendLog(`Đã tạo EPUB: ${file.filename}`);
      }

      await appendLog(`Hoàn tất tập: ${volume.title}`);
    }

    if (volumeFiles.length) {
      const zipFile = await packageDownloadsZip(novel.title, volumeFiles);
      createdFiles.push({
        ...zipFile,
        format: "zip",
        objectUrl: URL.createObjectURL(zipFile.blob),
      });
      await appendLog(`Đã đóng gói file ZIP: ${zipFile.filename}`);
    }

    // Upload to Supabase Storage + metadata
    for (const file of createdFiles) {
      const storagePath = `${userId}/${jobId}/${file.filename}`;
      const { error: uploadError } = await supabase.storage
        .from("downloads")
        .upload(storagePath, file.blob, {
          upsert: true,
          contentType: file.blob.type || "application/octet-stream",
        });

      if (uploadError) {
        await appendLog(
          `Cảnh báo upload ${file.filename}: ${uploadError.message}`,
        );
        continue;
      }

      file.storagePath = storagePath;
      const { data: meta } = await supabase
        .from("download_files")
        .insert({
          job_id: jobId,
          user_id: userId,
          novel_id: novel.id || null,
          filename: file.filename,
          format: file.format,
          storage_path: storagePath,
          size_bytes: file.blob.size,
        })
        .select("id")
        .single();
      if (meta?.id) file.id = meta.id;
    }

    progress(1, "Hoàn tất tải truyện.");
    await appendLog("Hoàn tất tải truyện.");
    await supabase
      .from("download_jobs")
      .update({
        status: "completed",
        progress: 1,
        current_message: "Hoàn tất tải truyện.",
        finished_at: new Date().toISOString(),
        logs,
      })
      .eq("id", jobId);

    return createdFiles;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(`Lỗi: ${message}`);
    await supabase
      .from("download_jobs")
      .update({
        status: "failed",
        error: message,
        current_message: "Tải truyện thất bại.",
        finished_at: new Date().toISOString(),
        logs,
      })
      .eq("id", jobId);
    throw err;
  }
}

// keep type import used
export type { VolumeInfo };
