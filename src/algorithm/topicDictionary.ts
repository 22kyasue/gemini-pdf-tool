// ══════════════════════════════════════════════════════════
// TOPIC DICTIONARY — Keyword-based topic classification
// ══════════════════════════════════════════════════════════

/**
 * Topic dictionary mapping topic labels to keyword lists.
 * Keywords are matched case-insensitively.
 *
 * Users can extend this dictionary via Phase 4 (personalization).
 */
const TOPIC_DICT: Record<string, string[]> = {
    GIT: [
        'git', 'commit', 'push', 'pull', 'merge', 'branch', 'rebase', 'stash',
        'cherry-pick', 'checkout', 'clone', 'fetch', 'remote', 'upstream',
        'gitignore', '.git', 'HEAD', 'detached', 'conflict',
    ],
    NPM: [
        'npm', 'yarn', 'pnpm', 'package.json', 'node_modules', 'package-lock',
        'npm install', 'npm run', 'npx', 'devDependencies', 'dependencies',
        'semver', 'registry',
    ],
    NODE: [
        'node', 'nodejs', 'node.js', 'express', 'deno', 'bun',
        'require', 'module', 'commonjs', 'esm', 'ts-node',
    ],
    REACT: [
        'react', 'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
        'component', 'jsx', 'tsx', 'props', 'state', 'hook', 'context',
        'react-dom', 'react-router', 'next.js', 'nextjs', 'vite',
        'create-react-app', 'remix',
    ],
    TYPESCRIPT: [
        'typescript', 'ts', 'tsx', 'tsconfig', 'type', 'interface',
        'generic', 'enum', 'union', 'intersection', 'keyof', 'typeof',
        'as const', 'satisfies',
    ],
    CSS: [
        'css', 'scss', 'sass', 'less', 'tailwind', 'tailwindcss',
        'styled-components', 'emotion', 'postcss', 'flexbox', 'grid',
        'responsive', 'media query', 'animation', 'transition',
    ],
    SUPABASE: [
        'supabase', 'rls', 'row level security', 'postgres', 'postgresql',
        'edge function', 'supabase-js', 'supabase auth',
    ],
    FIREBASE: [
        'firebase', 'firestore', 'cloud function', 'cloud messaging',
        'firebase auth', 'realtime database', 'firebase hosting',
        'analytics', 'crashlytics',
    ],
    AUTH: [
        '認証', 'ログイン', 'ログアウト', 'サインアップ', 'サインイン',
        'auth', 'oauth', 'oauth2', 'jwt', 'token', 'session',
        'cookie', 'passport', 'bcrypt', 'hash', 'password',
        '二要素認証', '2fa', 'mfa',
    ],
    UI: [
        'ui', 'ux', 'レイアウト', 'デザイン', 'ボタン', 'フォント',
        'カラー', '色', 'アイコン', 'モーダル', 'ダイアログ',
        'フォーム', 'input', 'dropdown', 'sidebar', 'navbar', 'header',
        'footer', 'responsive', 'mobile', 'tablet', 'desktop',
    ],
    BUG: [
        'bug', 'バグ', 'fix', '修正', 'デバッグ', 'debug', 'debugging',
        'issue', '問題', 'workaround', '原因', 'regression',
        'reproduce', '再現',
    ],
    DB: [
        'database', 'db', 'sql', 'mysql', 'postgres', 'postgresql',
        'sqlite', 'mongodb', 'redis', 'query', 'table', 'column',
        'migration', 'schema', 'index', 'join', 'select', 'insert',
        'update', 'delete', 'transaction',
    ],
    API: [
        'api', 'endpoint', 'rest', 'restful', 'graphql', 'grpc',
        'fetch', 'axios', 'request', 'response', 'status code',
        'json', 'xml', 'webhook', 'websocket', 'cors',
    ],
    DEPLOY: [
        'deploy', 'deployment', 'vercel', 'netlify', 'heroku',
        'docker', 'dockerfile', 'kubernetes', 'k8s', 'ci', 'cd',
        'ci/cd', 'github actions', 'gitlab ci', 'jenkins',
        'terraform', 'aws', 'gcp', 'azure',
    ],
    TESTING: [
        'test', 'テスト', 'testing', 'jest', 'vitest', 'mocha',
        'cypress', 'playwright', 'e2e', 'unit test', 'integration test',
        'mock', 'stub', 'spy', 'assertion', 'expect', 'coverage',
    ],
    PC_SETTING: [
        '設定', 'config', 'configuration', 'env', '環境変数',
        'windows', 'mac', 'macos', 'linux', 'ubuntu',
        'terminal', 'shell', 'bash', 'zsh', 'powershell',
        'path', 'PATH', 'homebrew',
    ],
    PYTHON: [
        'python', 'pip', 'virtualenv', 'venv', 'conda',
        'django', 'flask', 'fastapi', 'pandas', 'numpy',
        'matplotlib', 'pytorch', 'tensorflow',
    ],
    AI_ML: [
        'ai', '機械学習', 'machine learning', 'ml', 'deep learning',
        'neural network', 'llm', 'gpt', 'gemini', 'claude',
        'transformer', 'embedding', 'vector', 'rag',
        'prompt', 'fine-tune', 'model', 'inference',
    ],
};

/**
 * Pre-compile regex patterns for each topic (case-insensitive, word-boundary).
 */
const TOPIC_PATTERNS: { topic: string; patterns: RegExp[] }[] = Object.entries(TOPIC_DICT).map(
    ([topic, keywords]) => ({
        topic,
        patterns: keywords.map(kw => {
            // Escape special regex chars in keyword
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // For short keywords (≤3 chars), require word boundary to avoid false positives
            if (kw.length <= 3) {
                return new RegExp(`\\b${escaped}\\b`, 'i');
            }
            return new RegExp(escaped, 'i');
        }),
    })
);

/**
 * Detect topics in a text block.
 *
 * Returns array of matching topic labels (multi-label),
 * sorted by match count (highest first).
 */
export function detectTopics(text: string): string[] {
    const matches: { topic: string; count: number }[] = [];

    for (const { topic, patterns } of TOPIC_PATTERNS) {
        let count = 0;
        for (const pattern of patterns) {
            if (pattern.test(text)) count++;
        }
        if (count > 0) {
            matches.push({ topic, count });
        }
    }

    // Sort by match count (descending) — more matches = more relevant topic
    matches.sort((a, b) => b.count - a.count);

    return matches.map(m => m.topic);
}

/**
 * Get the full topic dictionary (for UI display or user customization).
 */
export function getTopicDictionary(): Record<string, string[]> {
    return { ...TOPIC_DICT };
}

/**
 * Match topics and return detailed results with match counts.
 */
export function detectTopicsDetailed(text: string): { topic: string; count: number; keywords: string[] }[] {
    const results: { topic: string; count: number; keywords: string[] }[] = [];

    for (const { topic, patterns } of TOPIC_PATTERNS) {
        const matchedKeywords: string[] = [];
        const keywords = TOPIC_DICT[topic];

        for (let i = 0; i < patterns.length; i++) {
            if (patterns[i].test(text)) {
                matchedKeywords.push(keywords[i]);
            }
        }

        if (matchedKeywords.length > 0) {
            results.push({
                topic,
                count: matchedKeywords.length,
                keywords: matchedKeywords,
            });
        }
    }

    results.sort((a, b) => b.count - a.count);
    return results;
}
