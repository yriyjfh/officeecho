/**
 * Configuration service for xmov credentials
 * 重新导出统一配置，保持向后兼容
 */

import type { XmovConfig } from '../types/xmov';
import {
  getXmovConfig as getConfig,
  setXmovConfig as setConfig,
  isXmovConfigValid as isValid,
  clearXmovConfig as clearConfig,
} from '../../config/services';

// 重新导出类型
export type { XmovConfig };

export const getXmovConfig = (): XmovConfig => {
  return getConfig() as XmovConfig;
};

export const setXmovConfig = (appId: string, appSecret: string): void => {
  setConfig({ appId, appSecret });
};

export const isXmovConfigValid = (config: XmovConfig): boolean => {
  return isValid(config as any);
};

export const clearXmovConfig = (): void => {
  clearConfig();
};
