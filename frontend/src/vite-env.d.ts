/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Aptric API (backend/), e.g. https://api.aptric.app */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
