/**
 * 服务配置文件
 * 统一配置 Xmov SDK 的相关参数
 *
 * 注意：Fay 消息现在通过服务端 Socket.IO 转发，前端不再直接连接 Fay
 *
 * 配置优先级:
 * 1. localStorage (运行时可修改)
 * 2. 环境变量 (构建时注入)
 * 3. 默认值
 */

// 导入 Xmov 类型定义
import type { XmovConfig } from '../elderly/types/xmov';
export type { XmovConfig };

// ==================== Xmov SDK 配置 ====================

const XMOV_CONFIG_KEYS = {
  appId: 'XMOV_APP_ID',
  appSecret: 'XMOV_APP_SECRET',
  gatewayServer: 'XMOV_GATEWAY_SERVER',
};

// 默认配置
const DEFAULT_XMOV_CONFIG = {
  gatewayServer: 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session',
};

/**
 * 获取 Xmov SDK 配置
 */
export const getXmovConfig = (): XmovConfig => {
  const storedAppId = localStorage.getItem(XMOV_CONFIG_KEYS.appId);
  const storedAppSecret = localStorage.getItem(XMOV_CONFIG_KEYS.appSecret);
  const storedGatewayServer = localStorage.getItem(XMOV_CONFIG_KEYS.gatewayServer);

  // 从环境变量读取
  const envAppId = (import.meta as any).env?.VITE_XMOV_APP_ID || '';
  const envAppSecret = (import.meta as any).env?.VITE_XMOV_APP_SECRET || '';
  const envGatewayServer = (import.meta as any).env?.VITE_XMOV_GATEWAY_SERVER || '';

  return {
    appId: storedAppId || envAppId || '',
    appSecret: storedAppSecret || envAppSecret || '',
    gatewayServer: storedGatewayServer || envGatewayServer || DEFAULT_XMOV_CONFIG.gatewayServer,
  };
};

/**
 * 设置 Xmov SDK 配置
 */
export const setXmovConfig = (config: Partial<XmovConfig>): void => {
  if (config.appId) {
    localStorage.setItem(XMOV_CONFIG_KEYS.appId, config.appId);
  }
  if (config.appSecret) {
    localStorage.setItem(XMOV_CONFIG_KEYS.appSecret, config.appSecret);
  }
  if (config.gatewayServer) {
    localStorage.setItem(XMOV_CONFIG_KEYS.gatewayServer, config.gatewayServer);
  }
};

/**
 * 验证 Xmov 配置是否有效
 */
export const isXmovConfigValid = (config: XmovConfig): boolean => {
  return !!config.appId && !!config.appSecret &&
    config.appId.trim() !== '' && config.appSecret.trim() !== '';
};

/**
 * 清除 Xmov 配置 (恢复默认)
 */
export const clearXmovConfig = (): void => {
  localStorage.removeItem(XMOV_CONFIG_KEYS.appId);
  localStorage.removeItem(XMOV_CONFIG_KEYS.appSecret);
  localStorage.removeItem(XMOV_CONFIG_KEYS.gatewayServer);
};

// ==================== 统一配置管理 ====================

export interface AllServicesConfig {
  xmov: XmovConfig;
}

/**
 * 获取所有服务配置
 */
export const getAllConfig = (): AllServicesConfig => {
  return {
    xmov: getXmovConfig(),
  };
};

/**
 * 设置所有服务配置
 */
export const setAllConfig = (config: Partial<AllServicesConfig>): void => {
  if (config.xmov) {
    setXmovConfig(config.xmov);
  }
};

/**
 * 清除所有服务配置
 */
export const clearAllConfig = (): void => {
  clearXmovConfig();
};

/**
 * 导出配置为 JSON 字符串 (用于备份)
 */
export const exportConfig = (): string => {
  return JSON.stringify(getAllConfig(), null, 2);
};

/**
 * 从 JSON 字符串导入配置
 */
export const importConfig = (jsonString: string): boolean => {
  try {
    const config = JSON.parse(jsonString) as AllServicesConfig;
    setAllConfig(config);
    return true;
  } catch (error) {
    console.error('导入配置失败:', error);
    return false;
  }
};
