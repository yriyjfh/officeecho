/**
 * XmovAvatar SDK TypeScript Type Definitions
 */

export interface XmovConfig {
  appId: string;
  appSecret: string;
  gatewayServer?: string;
}

export interface XmovSDKOptions {
  containerId: string;
  appId: string;
  appSecret: string;
  gatewayServer: string;
  onWidgetEvent?: (data: any) => void;
  onNetworkInfo?: (networkInfo: any) => void;
  onMessage?: (message: any) => void;
  onStateChange?: (state: string) => void;
  onStatusChange?: (status: string) => void;
  onStateRenderChange?: (state: string, duration: number) => void;
  onVoiceStateChange?: (status: 'start' | 'end') => void;
  enableLogger?: boolean;
}

export interface XmovInitOptions {
  onDownloadProgress?: (progress: number) => void;
  onError?: (error: any) => void;
  onClose?: () => void;
}

export interface XmovAvatarSDK {
  init(options: XmovInitOptions): Promise<void>;
  speak(text: string, isFirst: boolean, isEnd: boolean): void;
  think(): void;
  listen(): void;
  idle(): void;
  interactiveidle(): void; // 注意：SDK文档中是小写
  offlineMode(): void;
  onlineMode(): void;
  destroy(): void;
  resize?(): void; // 可选：窗口大小变化时调用
}

declare global {
  interface Window {
    XmovAvatar: new (options: XmovSDKOptions) => XmovAvatarSDK;
  }
}

export {};
