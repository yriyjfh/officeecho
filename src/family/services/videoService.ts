/**
 * 视频流服务
 * 管理 MJPEG 视频流的连接和状态
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface VideoConfig {
  device_index: number;
  frame_rate: number;
  jpeg_quality: number;
  resolution_width: number;
  resolution_height: number;
}

export interface VideoStatus {
  status: 'stopped' | 'starting' | 'running' | 'error';
  client_count: number;
  config: {
    device_index: number;
    frame_rate: number;
    jpeg_quality: number;
    resolution: string;
  };
  error: string | null;
  opencv_available: boolean;
}

export interface VideoDevice {
  index: number;
  name: string;
  resolution: string;
  available: boolean;
}

/**
 * 获取 MJPEG 视频流 URL
 */
export function getVideoStreamUrl(familyId?: string): string {
  const hostname = window.location.hostname;
  const baseUrl = `http://${hostname}:8000/api/video/stream`;
  return familyId ? `${baseUrl}?family_id=${familyId}` : baseUrl;
}

/**
 * 获取快照 URL
 */
export function getSnapshotUrl(): string {
  const hostname = window.location.hostname;
  return `http://${hostname}:8000/api/video/snapshot`;
}

/**
 * 获取摄像头状态
 */
export async function getVideoStatus(): Promise<VideoStatus> {
  const response = await fetch(`${getApiUrl()}/video/status`);
  if (!response.ok) {
    throw new Error('获取摄像头状态失败');
  }
  return response.json();
}

/**
 * 获取摄像头配置
 */
export async function getVideoConfig(): Promise<VideoConfig> {
  const response = await fetch(`${getApiUrl()}/video/config`);
  if (!response.ok) {
    throw new Error('获取摄像头配置失败');
  }
  return response.json();
}

/**
 * 更新摄像头配置
 */
export async function updateVideoConfig(config: Partial<VideoConfig>): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  try {
    const response = await fetch(`${getApiUrl()}/video/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error('更新摄像头配置失败');
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请重试');
    }
    throw err;
  }
}

/**
 * 启动摄像头
 */
export async function startCamera(): Promise<VideoStatus> {
  const response = await fetch(`${getApiUrl()}/video/start`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('启动摄像头失败');
  }
  const data = await response.json();
  return data.status;
}

/**
 * 停止摄像头
 */
export async function stopCamera(): Promise<void> {
  const response = await fetch(`${getApiUrl()}/video/stop`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('停止摄像头失败');
  }
}

/**
 * 获取可用摄像头设备列表
 */
export async function getVideoDevices(): Promise<{ devices: VideoDevice[]; current_device: number }> {
  const response = await fetch(`${getApiUrl()}/video/devices`);
  if (!response.ok) {
    throw new Error('获取摄像头设备列表失败');
  }
  return response.json();
}
