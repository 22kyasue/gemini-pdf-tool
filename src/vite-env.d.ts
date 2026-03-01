/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRIPE_PRICE_ID: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  // VITE_GOOGLE_API_KEY intentionally removed — key is now in Supabase secrets
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'html2pdf.js' {
    interface Html2PdfOptions {
        margin?: number | number[];
        filename?: string;
        image?: { type: string; quality: number };
        html2canvas?: { scale?: number; useCORS?: boolean; [key: string]: unknown };
        jsPDF?: { unit?: string; format?: string; orientation?: string; [key: string]: unknown };
        [key: string]: unknown;
    }

    interface Html2Pdf {
        set: (options: Html2PdfOptions) => Html2Pdf;
        from: (element: HTMLElement) => Html2Pdf;
        save: () => void;
        // Add other methods as needed
    }

    function html2pdf(): Html2Pdf;
    export = html2pdf;
}
declare module 'highlight.js/lib/core' {
    import { HLJSApi } from 'highlight.js';
    const hljs: HLJSApi;
    export default hljs;
}

declare module 'highlight.js/lib/languages/*' {
    import { LanguageFn } from 'highlight.js';
    const language: LanguageFn;
    export default language;
}
declare module 'remark-math' {
    const remarkMath: any;
    export default remarkMath;
}

declare module 'rehype-katex' {
    const rehypeKatex: any;
    export default rehypeKatex;
}

// Google Identity Services (GSI)
interface GoogleCredentialResponse {
    credential: string;
    select_by: string;
}

interface GoogleIdConfig {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    itp_support?: boolean;
}

interface GoogleButtonConfig {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number | string;
    logo_alignment?: 'left' | 'center';
    locale?: string;
}

interface Google {
    accounts: {
        id: {
            initialize: (config: GoogleIdConfig) => void;
            renderButton: (parent: HTMLElement, config: GoogleButtonConfig) => void;
            prompt: () => void;
            disableAutoSelect: () => void;
        };
    };
}

interface Window {
    google?: Google;
}
