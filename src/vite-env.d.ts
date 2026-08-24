/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_ENABLED?: string;
  readonly VITE_COMMERCE_ENABLED?: string;
  readonly VITE_MERCADO_LIBRE_CATALOG_ENABLED?: string;
  readonly VITE_WHATSAPP_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:shekinah-catalog-index' {
  const products: readonly unknown[];
  export default products;
}
