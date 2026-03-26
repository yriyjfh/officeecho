/**
 * 屏幕端文件服务
 * 负责获取推荐文件、记录播放、提交反馈
 */

import { getApiBaseUrl, getUploadUrl as configGetUploadUrl, getThumbnailUrl as configGetThumbnailUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface RecommendedMedia {
  id: number;
  family_id: string;
  media_type: 'photo' | 'video' | 'pdf';  // 已包含 pdf
  title: string;
  description?: string;
  file_path: string;
  thumbnail_path?: string;
  tags: string[];
  time_windows: string[];
  moods: string[];
  occasions: string[];
  cooldown: number;
  priority: number;
  play_count: number;
  last_played_at?: string;
}

export interface PlayRecordParams {
  elderly_id: number;
  duration_watched?: number;
  completed?: number;
  triggered_by?: 'auto' | 'manual' | 'mood';
  mood_before?: string;
  mood_after?: string;
}

export interface FeedbackParams {
  elderly_id: number;
  feedback_type: 'like' | 'dislike';
}

export interface DownloadRecordParams {
  elderly_id: number;
  download_type?: 'pdf' | 'video' | 'photo';
}

export interface RecommendedMediaResponse {
  media: RecommendedMedia[];
  available_tags: string[];
}

/**
 * 获取推荐文件
 */
export async function getRecommendedMedia(
  familyId: string,
  elderlyId: number,
  mood?: string,
  occasion?: string,
  tags?: string[]
): Promise<RecommendedMediaResponse> {
  const params = new URLSearchParams({
    family_id: familyId,
    elderly_id: elderlyId.toString(),
  });

  if (mood) params.append('mood', mood);
  if (occasion) params.append('occasion', occasion);
  if (tags && tags.length > 0) params.append('tags', tags.join(','));

  const response = await fetch(`${getApiUrl()}/elderly/media/recommended?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '获取推荐文件失败');
  }

  const data = await response.json();
  return {
    media: data.media,
    available_tags: data.available_tags || []
  };
}

/**
 * 记录文件播放
 */
export async function recordMediaPlay(mediaId: number, params: PlayRecordParams): Promise<void> {
  const response = await fetch(`${getApiUrl()}/elderly/media/${mediaId}/play`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '记录播放失败');
  }
}

/**
 * 记录文件下载
 */
export async function recordDownload(mediaId: number, elderlyId: number, downloadType?: string): Promise<void> {
  const params: any = { elderly_id: elderlyId };
  if (downloadType) params.download_type = downloadType;

  const response = await fetch(`${getApiUrl()}/elderly/media/${mediaId}/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '记录下载失败');
  }
}

/**
 * 提交文件反馈
 */
export async function submitFeedback(mediaId: number, params: FeedbackParams): Promise<void> {
  const response = await fetch(`${getApiUrl()}/elderly/media/${mediaId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '提交反馈失败');
  }
}

/**
 * 获取文件URL（用于前端显示）
 */
export function getMediaUrl(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() || '';
  return configGetUploadUrl(filename);
}

/**
 * 获取缩略图URL
 */
export function getThumbnailUrl(thumbnailPath: string): string {
  const filename = thumbnailPath.split(/[/\\]/).pop() || '';
  return configGetThumbnailUrl(filename);
}