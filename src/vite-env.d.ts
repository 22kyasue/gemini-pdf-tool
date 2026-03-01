declare module 'html2pdf.js' {
    interface Html2PdfOptions {
        margin?: number | number[];
        filename?: string;
        image?: { type: string; quality: number };
        html2canvas?: { scale?: number; useCORS?: boolean;[key: string]: any };
        jsPDF?: { unit?: string; format?: string; orientation?: string;[key: string]: any };
        [key: string]: any;
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
