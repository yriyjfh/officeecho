import { getApiBaseUrl } from '../../config/api';

const LAN_IP_STORAGE_KEY = 'OFFICEECHO_LAN_IP';
const LAN_IP_UPDATED_EVENT = 'officeecho:lan-ip-updated';
const ADMIN_PORT = 3001;
const API_PORT = 8000;
let memoryLanIp = '';

const getLanIpApiUrl = () => `${getApiBaseUrl()}/device/lan-ip`;

const notifyLanIpUpdated = (lanIp: string) => {
  window.dispatchEvent(
    new CustomEvent(LAN_IP_UPDATED_EVENT, {
      detail: lanIp,
    }),
  );
};

const writeLanIpLocally = (lanIp: string): string => {
  memoryLanIp = lanIp;

  try {
    window.localStorage.setItem(LAN_IP_STORAGE_KEY, lanIp);
  } catch (error) {
    console.error('[lanAccess] Failed to persist LAN IP to localStorage:', error);
  }

  return lanIp;
};

const readStoredLanIp = (): string => {
  if (memoryLanIp && isValidLanIp(memoryLanIp)) {
    return memoryLanIp;
  }

  try {
    const storedLanIp = window.localStorage.getItem(LAN_IP_STORAGE_KEY)?.trim() || '';
    if (storedLanIp && isValidLanIp(storedLanIp)) {
      memoryLanIp = storedLanIp;
      return storedLanIp;
    }

    return '';
  } catch (error) {
    console.error('[lanAccess] Failed to read stored LAN IP:', error);
    return '';
  }
};

export const isValidLanIp = (ip: string) => {
  const normalizedIp = ip.trim();
  const match = normalizedIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  );
};

export const getInitialLanIp = (): string => {
  const storedLanIp = readStoredLanIp();
  if (storedLanIp && isValidLanIp(storedLanIp)) {
    return storedLanIp;
  }

  const hostname = window.location.hostname.trim();
  if (hostname && isValidLanIp(hostname)) {
    return hostname;
  }

  return '';
};

export const getLanAccessHost = (overrideLanIp?: string): string => {
  const normalizedOverride = overrideLanIp?.trim() || '';
  if (normalizedOverride && isValidLanIp(normalizedOverride)) {
    return normalizedOverride;
  }

  const initialLanIp = getInitialLanIp();
  if (initialLanIp) {
    return initialLanIp;
  }

  const hostname = window.location.hostname.trim();
  return hostname || 'localhost';
};

export const getLanAccessProtocol = (): string => {
  return window.location.protocol === 'https:' ? 'https:' : 'http:';
};

export const buildAdminEntryUrl = (lanIp?: string): string => {
  return `${getLanAccessProtocol()}//${getLanAccessHost(lanIp)}:${ADMIN_PORT}/admin.html`;
};

export const buildMediaDownloadUrl = ({
  filePath,
  title,
  lanIp,
}: {
  filePath: string;
  title: string;
  lanIp?: string;
}): string => {
  const filename = filePath.split(/[/\\]/).pop() || '';
  const extension = filename.split('.').pop() || '';
  const downloadName = encodeURIComponent(`${title}.${extension}`);

  return `${getLanAccessProtocol()}//${getLanAccessHost(lanIp)}:${API_PORT}/uploads/${filename}?download_name=${downloadName}`;
};

export const persistLanIp = (ip: string): string | null => {
  const normalizedIp = ip.trim();
  if (!isValidLanIp(normalizedIp)) {
    return null;
  }

  notifyLanIpUpdated(writeLanIpLocally(normalizedIp));
  return normalizedIp;
};

export const subscribeLanIpChange = (listener: (lanIp: string) => void): (() => void) => {
  const handleLanIpUpdated = () => {
    listener(getInitialLanIp());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === LAN_IP_STORAGE_KEY) {
      listener(getInitialLanIp());
    }
  };

  window.addEventListener(LAN_IP_UPDATED_EVENT, handleLanIpUpdated);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(LAN_IP_UPDATED_EVENT, handleLanIpUpdated);
    window.removeEventListener('storage', handleStorage);
  };
};

export const hydratePersistedLanIp = async (): Promise<string> => {
  try {
    const response = await fetch(getLanIpApiUrl());
    if (!response.ok) {
      return getInitialLanIp();
    }

    const data = await response.json();
    const lanIp = String(data.lan_ip || '').trim();
    if (!isValidLanIp(lanIp)) {
      return getInitialLanIp();
    }

    writeLanIpLocally(lanIp);
    notifyLanIpUpdated(lanIp);
    return lanIp;
  } catch (error) {
    console.error('[lanAccess] Failed to load persisted LAN IP:', error);
    return getInitialLanIp();
  }
};

export const savePersistedLanIp = async (ip: string): Promise<string | null> => {
  const normalizedIp = ip.trim();
  if (!isValidLanIp(normalizedIp)) {
    return null;
  }

  try {
    const response = await fetch(getLanIpApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lan_ip: normalizedIp }),
    });

    if (!response.ok) {
      console.error('[lanAccess] Failed to save LAN IP to backend:', response.status);
      return persistLanIp(normalizedIp);
    }

    const data = await response.json();
    const savedLanIp = String(data.lan_ip || '').trim();
    if (!isValidLanIp(savedLanIp)) {
      return persistLanIp(normalizedIp);
    }

    notifyLanIpUpdated(writeLanIpLocally(savedLanIp));
    return savedLanIp;
  } catch (error) {
    console.error('[lanAccess] Failed to save persisted LAN IP:', error);
    return persistLanIp(normalizedIp);
  }
};
