/**
 * 白板服务（管理端）
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
