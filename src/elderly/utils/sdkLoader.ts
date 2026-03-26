/**
 * Utility to dynamically load the xmov SDK script
 */

const XMOV_SDK_URL = 'https://media.youyan.xyz/youling-lite-sdk/index.umd.0.1.0-alpha.63.js';

let isSDKLoaded = false;
let isSDKLoading = false;
let loadPromise: Promise<void> | null = null;

export const loadXmovSDK = (): Promise<void> => {
  if (isSDKLoading && loadPromise) {
    return loadPromise;
  }

  if (isSDKLoaded && window.XmovAvatar) {
    return Promise.resolve();
  }

  isSDKLoading = true;

  loadPromise = new Promise((resolve, reject) => {
    if (window.XmovAvatar) {
      isSDKLoaded = true;
      isSDKLoading = false;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = XMOV_SDK_URL;
    script.async = true;

    script.onload = () => {
      if (window.XmovAvatar) {
        console.log('[SDK Loader] xmov SDK loaded successfully');
        isSDKLoaded = true;
        isSDKLoading = false;
        resolve();
      } else {
        const error = new Error('XmovAvatar not found on window after script load');
        console.error('[SDK Loader]', error);
        isSDKLoading = false;
        reject(error);
      }
    };

    script.onerror = (error) => {
      console.error('[SDK Loader] Failed to load xmov SDK:', error);
      isSDKLoading = false;
      reject(new Error('Failed to load xmov SDK script'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
};

export const isXmovSDKLoaded = (): boolean => {
  return isSDKLoaded && !!window.XmovAvatar;
};
