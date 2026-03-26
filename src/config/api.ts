/**
 * API 配置
 * 动态根据当前访问的 hostname 生成 API 地址
 * 支持 localhost 开发、局域网访问和 Electron 环境
 */

// 后端服务端口
const API_PORT = 8000;

/**
 * 获取有效的 hostname
 * 在 Electron 生产环境下（file:// 协议），hostname 为空，需要使用 localhost
 */
const getHostname = (): string => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // 如果是 file:// 协议（Electron 生产环境）或 hostname 为空，使用 localhost
  if (protocol === 'file:' || !hostname) {
    return 'localhost';
  }

  return hostname;
};

const getProtocol = (): string => {
  const protocol = window.location.protocol;
  if (!protocol || protocol === 'file:') {
    return 'http:';
  }
  return protocol;
};

/**
 * 获取 API 基础 URL
 * 如果是通过局域网 IP 访问前端，API 也使用同样的 IP
 */
export const getApiBaseUrl = (): string => {
  const hostname = getHostname();
  const protocol = getProtocol();
  return `${protocol}//${hostname}:${API_PORT}/api`;
};

/**
 * 获取上传文件的 URL
 */
export const getUploadUrl = (filename: string): string => {
  const hostname = getHostname();
  const protocol = getProtocol();
  return `${protocol}//${hostname}:${API_PORT}/uploads/${filename}`;
};

/**
 * 获取缩略图 URL
 */
export const getThumbnailUrl = (filename: string): string => {
  const hostname = getHostname();
  const protocol = getProtocol();
  return `${protocol}//${hostname}:${API_PORT}/uploads/thumbnails/${filename}`;
};

// 兼容旧代码的静态导出
export const API_BASE_URL = getApiBaseUrl();
