/**
 * 白板服务（屏幕端）
 */

import { getApiBaseUrl, getUploadUrl as configGetUploadUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface WhiteboardItem {
  id: number;
  family_id: string;
  title?: string | null;
  file_path?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function listWhiteboards(familyId: string): Promise<WhiteboardItem[]> {
  const params = new URLSearchParams({ family_id: familyId });
  const response = await fetch(`${getApiUrl()}/whiteboards?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '获取白板列表失败');
  }

  const data = await response.json();
  return data.whiteboards || [];
}

export async function createWhiteboard(
  familyId: string,
  imageData: string,
  title?: string
): Promise<WhiteboardItem> {
  const response = await fetch(`${getApiUrl()}/whiteboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ family_id: familyId, image_data: imageData, title }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '创建白板失败');
  }

  return response.json();
}

export async function updateWhiteboard(
  whiteboardId: number,
  imageData: string,
  title?: string
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/whiteboards/${whiteboardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_data: imageData, title }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '更新白板失败');
  }
}

export async function deleteWhiteboard(whiteboardId: number): Promise<void> {
  const response = await fetch(`${getApiUrl()}/whiteboards/${whiteboardId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '删除白板失败');
  }
}

export function getWhiteboardUrl(filePath: string): string {
  return configGetUploadUrl(filePath);
}
