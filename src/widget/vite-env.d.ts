/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __ORJN_CONFIG__?: {
    apiUrl?: string;
    shopDomain?: string;
    whatsappNumber?: string;
    whatsappEnabled?: boolean;
    nudgeEnabled?: boolean;
    personalShopperEnabled?: boolean;
    activeClosersEnabled?: boolean;
  };
}
