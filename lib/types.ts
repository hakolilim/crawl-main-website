export type UserRole = "user" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: UserRole;
  hako_user_label: string | null;
  hako_logged_in: boolean;
  created_at: string;
  updated_at: string;
};

export type ChapterInfo = {
  title: string;
  url: string;
};

export type VolumeInfo = {
  id: number;
  title: string;
  chapter_count: number;
  chapters: ChapterInfo[];
};

export type NovelData = {
  id?: string;
  title: string;
  author: string;
  genres: string;
  summary: string;
  volumes: VolumeInfo[];
  source_url: string;
};

export type ExportFormat = "txt" | "docx" | "epub";

export type ChapterPayload = {
  title: string;
  html: string;
  images: ChapterImage[];
};

export type ChapterImage = {
  name: string;
  /** base64 without data: prefix */
  dataBase64: string;
  contentType: string;
};

export type DownloadJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type DownloadJob = {
  id: string;
  user_id: string;
  novel_id: string | null;
  selected_volume_ids: number[];
  export_formats: ExportFormat[];
  status: DownloadJobStatus;
  progress: number;
  current_message: string | null;
  logs: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type DownloadFile = {
  id: string;
  job_id: string | null;
  user_id: string;
  novel_id: string | null;
  filename: string;
  format: string | null;
  storage_path: string;
  size_bytes: number;
  created_at: string;
};

export type PlaywrightStorageState = {
  cookies: Array<Record<string, unknown>>;
  origins: Array<Record<string, unknown>>;
};
