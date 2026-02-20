// ══════════════════════════════════════════════════════════
// TEST FIXTURES — Labeled conversation data for evaluation
// ══════════════════════════════════════════════════════════

export interface LabeledMessage {
    role: 'user' | 'ai';
    text: string;
}

export interface TestCase {
    id: string;
    name: string;
    description: string;
    /** The raw text as it would be pasted */
    rawText: string;
    /** Ground truth labels */
    expectedMessages: LabeledMessage[];
    /** Expected segment boundary positions (char offsets where splits occur) */
    expectedBoundaryCount: number;
}

// ── Test Case 1: Simple Q&A with markers ──
const tc01_simpleMarked: TestCase = {
    id: 'tc01',
    name: 'Simple Q&A (marked)',
    description: 'Basic Gemini conversation with explicit markers',
    rawText: `あなた

TypeScriptでenumとunion typeの違いを教えて

Gemini の回答

TypeScriptにおけるenumとunion typeの違いについて説明します。

## enum（列挙型）

enumは名前付き定数の集合を定義します。

\`\`\`typescript
enum Direction {
  Up,
  Down,
  Left,
  Right
}
\`\`\`

## union type（ユニオン型）

union typeは複数の型のいずれかを取る型を定義します。

\`\`\`typescript
type Direction = 'Up' | 'Down' | 'Left' | 'Right';
\`\`\`

### 主な違い

| 特徴 | enum | union type |
|------|------|-----------|
| ランタイムコスト | あり | なし |
| Tree-shaking | 不可 | 可能 |
| リバースマッピング | あり | なし |

一般的には、文字列リテラルのunion typeが推奨されます。`,
    expectedMessages: [
        { role: 'user', text: 'TypeScriptでenumとunion typeの違いを教えて' },
        { role: 'ai', text: 'TypeScriptにおけるenumとunion typeの違いについて説明します。' },
    ],
    expectedBoundaryCount: 2,
};

// ── Test Case 2: No markers (ChatGPT raw paste) ──
const tc02_noMarkers: TestCase = {
    id: 'tc02',
    name: 'No markers (raw paste)',
    description: 'ChatGPT conversation pasted without role markers',
    rawText: `Reactで状態管理どうするのがいい？

Reactでの状態管理にはいくつかのアプローチがあります。

### ローカルステート
コンポーネント内で完結する状態は \`useState\` で管理します。

### グローバルステート
アプリ全体で共有する状態には以下の選択肢があります：

1. **Context API** — 小〜中規模向け
2. **Zustand** — 軽量で使いやすい
3. **Redux Toolkit** — 大規模向け
4. **Jotai / Recoil** — アトミック設計

プロジェクトの規模に応じて選択することをお勧めします。

Zustandの例を見せて

以下はZustandの基本的な使い方です：

\`\`\`typescript
import { create } from 'zustand';

interface CounterStore {
  count: number;
  increment: () => void;
  decrement: () => void;
}

const useCounter = create<CounterStore>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
}));
\`\`\`

非常にシンプルですね。Reduxと比べてボイラープレートが大幅に削減されます。`,
    expectedMessages: [
        { role: 'user', text: 'Reactで状態管理どうするのがいい？' },
        { role: 'ai', text: 'Reactでの状態管理にはいくつかのアプローチがあります。' },
        { role: 'user', text: 'Zustandの例を見せて' },
        { role: 'ai', text: '以下はZustandの基本的な使い方です：' },
    ],
    expectedBoundaryCount: 4,
};

// ── Test Case 3: Error debugging flow ──
const tc03_errorDebug: TestCase = {
    id: 'tc03',
    name: 'Error debugging flow',
    description: 'User reports error, AI helps debug',
    rawText: `npm run buildしたらエラーが出た

error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
  src/utils.ts:42:15

このエラーは、関数に渡している引数の型が一致していないことを示しています。

\`src/utils.ts\` の42行目を確認してください。おそらく以下のようなコードがあると思います：

\`\`\`typescript
// 問題のコード
someFunction("123");  // string を渡している

// 修正
someFunction(123);    // number を渡すべき
// または
someFunction(Number("123"));  // 変換する
\`\`\`

直った！ありがとう

よかったです！TypeScriptの型エラーは慣れれば素早く対処できるようになります。他にも質問があればお気軽にどうぞ。`,
    expectedMessages: [
        { role: 'user', text: 'npm run buildしたらエラーが出た' },
        { role: 'user', text: 'error TS2345:' },
        { role: 'ai', text: 'このエラーは、関数に渡している引数の型が一致していないことを示しています。' },
        { role: 'user', text: '直った！ありがとう' },
        { role: 'ai', text: 'よかったです！' },
    ],
    expectedBoundaryCount: 5,
};

// ── Test Case 4: Multi-turn technical discussion ──
const tc04_multiTurn: TestCase = {
    id: 'tc04',
    name: 'Multi-turn technical',
    description: 'Multiple short user questions with detailed AI responses',
    rawText: `gitでブランチ消す方法

ローカルブランチを削除するには以下のコマンドを使用します：

\`\`\`bash
# マージ済みブランチの削除
git branch -d feature/my-branch

# 強制削除（マージ未完了でも削除）
git branch -D feature/my-branch
\`\`\`

リモートブランチも一緒に消せる？

はい、リモートブランチも削除できます：

\`\`\`bash
git push origin --delete feature/my-branch
\`\`\`

または短縮形：

\`\`\`bash
git push origin :feature/my-branch
\`\`\`

削除後は \`git fetch --prune\` でリモート追跡ブランチも整理することをお勧めします。

全部まとめてやるコマンドってない？

以下のワンライナーで処理できます：

\`\`\`bash
git branch -d feature/my-branch && git push origin --delete feature/my-branch && git fetch --prune
\`\`\`

エイリアスとして登録しておくと便利です：

\`\`\`bash
git config --global alias.nuke '!f() { git branch -D $1 && git push origin --delete $1; }; f'
\`\`\`

これで \`git nuke feature/my-branch\` だけで完了します。`,
    expectedMessages: [
        { role: 'user', text: 'gitでブランチ消す方法' },
        { role: 'ai', text: 'ローカルブランチを削除するには以下のコマンドを使用します：' },
        { role: 'user', text: 'リモートブランチも一緒に消せる？' },
        { role: 'ai', text: 'はい、リモートブランチも削除できます：' },
        { role: 'user', text: '全部まとめてやるコマンドってない？' },
        { role: 'ai', text: '以下のワンライナーで処理できます：' },
    ],
    expectedBoundaryCount: 6,
};

// ── Test Case 5: Claude-style with "You said:" / "Claude said:" markers ──
const tc05_claudeMarkers: TestCase = {
    id: 'tc05',
    name: 'Claude markers',
    description: 'Claude conversation with explicit markers',
    rawText: `You said:

Explain async/await in JavaScript

Claude said:

## Async/Await in JavaScript

\`async/await\` is syntactic sugar over Promises that makes asynchronous code easier to read and write.

### Basic Usage

\`\`\`javascript
async function fetchUser(id) {
  const response = await fetch(\`/api/users/\${id}\`);
  const user = await response.json();
  return user;
}
\`\`\`

### Key Points

- \`async\` functions always return a Promise
- \`await\` pauses execution until the Promise resolves
- Error handling uses standard \`try/catch\`

You said:

What about error handling?

Claude said:

Error handling with async/await is straightforward using try/catch:

\`\`\`javascript
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('HTTP error');
    return await response.json();
  } catch (error) {
    console.error('Fetch failed:', error);
    throw error;
  }
}
\`\`\``,
    expectedMessages: [
        { role: 'user', text: 'Explain async/await in JavaScript' },
        { role: 'ai', text: '## Async/Await in JavaScript' },
        { role: 'user', text: 'What about error handling?' },
        { role: 'ai', text: 'Error handling with async/await is straightforward using try/catch:' },
    ],
    expectedBoundaryCount: 4,
};

// ── Test Case 6: ChatGPT "You said:" / "ChatGPT said:" markers ──
const tc06_chatgptMarkers: TestCase = {
    id: 'tc06',
    name: 'ChatGPT markers',
    description: 'ChatGPT conversation with explicit markers',
    rawText: `You said:
Dockerfileのベストプラクティスを教えて

ChatGPT said:
Dockerfileを書く際のベストプラクティスをいくつか紹介します。

### 1. マルチステージビルド
\`\`\`dockerfile
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
\`\`\`

### 2. .dockerignore を活用
不要なファイルをビルドコンテキストから除外します。

### 3. レイヤーキャッシュを意識
変更が少ない命令を上に配置してキャッシュを活用します。`,
    expectedMessages: [
        { role: 'user', text: 'Dockerfileのベストプラクティスを教えて' },
        { role: 'ai', text: 'Dockerfileを書く際のベストプラクティスをいくつか紹介します。' },
    ],
    expectedBoundaryCount: 2,
};

// ── Test Case 7: Mixed language (EN + JP) ──
const tc07_mixedLang: TestCase = {
    id: 'tc07',
    name: 'Mixed language',
    description: 'Mixed Japanese and English content',
    rawText: `How do I setup Supabase auth?

Supabase Authのセットアップ方法を説明します。

### 1. Supabaseプロジェクト作成
[Supabase Dashboard](https://app.supabase.com)にアクセスし、新しいプロジェクトを作成します。

### 2. クライアントライブラリのインストール

\`\`\`bash
npm install @supabase/supabase-js
\`\`\`

### 3. 初期化コード

\`\`\`typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
\`\`\`

Google OAuthも使える？

はい、Supabase AuthはGoogle OAuthをサポートしています。

Settings > Authentication > Providers からGoogleを有効化し、Google Cloud ConsoleでOAuth 2.0クライアントIDを取得してください。`,
    expectedMessages: [
        { role: 'user', text: 'How do I setup Supabase auth?' },
        { role: 'ai', text: 'Supabase Authのセットアップ方法を説明します。' },
        { role: 'user', text: 'Google OAuthも使える？' },
        { role: 'ai', text: 'はい、Supabase AuthはGoogle OAuthをサポートしています。' },
    ],
    expectedBoundaryCount: 4,
};

// ── Test Case 8: Single long AI response ──
const tc08_longResponse: TestCase = {
    id: 'tc08',
    name: 'Single long response',
    description: 'One user question followed by a very long AI response',
    rawText: `CSSのflexboxとgridの使い分けを教えて

FlexboxとCSS Gridはどちらも強力なレイアウトシステムですが、それぞれ異なる用途に適しています。

## Flexbox

Flexboxは**一次元**のレイアウトに適しています。つまり、横方向または縦方向のどちらか一方にアイテムを配置する場合に最適です。

### 適用場面
- ナビゲーションバー
- ボタングループ
- メディアオブジェクト
- カードの中身の配置

\`\`\`css
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
\`\`\`

## CSS Grid

CSS Gridは**二次元**のレイアウトに適しています。行と列の両方を同時に制御できます。

### 適用場面
- ページ全体のレイアウト
- カードグリッド
- ダッシュボード
- 複雑なフォームレイアウト

\`\`\`css
.dashboard {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
}
\`\`\`

## まとめ

| 特徴 | Flexbox | Grid |
|------|---------|------|
| 次元 | 一次元 | 二次元 |
| 制御方向 | 行 or 列 | 行 + 列 |
| コンテンツ依存 | 高い | 低い |
| ブラウザサポート | 非常に良い | 良い |

実際のプロジェクトでは両方を組み合わせて使用するのが一般的です。`,
    expectedMessages: [
        { role: 'user', text: 'CSSのflexboxとgridの使い分けを教えて' },
        { role: 'ai', text: 'FlexboxとCSS Gridはどちらも強力なレイアウトシステムですが、' },
    ],
    expectedBoundaryCount: 2,
};

// ── Test Case 9: User pastes error log ──
const tc09_errorLog: TestCase = {
    id: 'tc09',
    name: 'Error log paste',
    description: 'User pastes a multi-line error log, AI diagnoses',
    rawText: `これが出た

TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (src/components/UserList.tsx:15:23)
    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:14985:18)
    at mountIndeterminateComponent (node_modules/react-dom/cjs/react-dom.development.js:17811:13)

このエラーは、\`undefined\` のプロパティ (\`map\`) を読み込もうとして発生しています。

\`UserList.tsx\` の15行目で、配列が \`undefined\` の状態で \`.map()\` を呼んでいるのが原因です。

### 修正方法

\`\`\`typescript
// Before (エラーになる)
return users.map(u => <UserCard key={u.id} user={u} />);

// After (オプショナルチェーン)
return users?.map(u => <UserCard key={u.id} user={u} />) ?? <p>ユーザーがいません</p>;
\`\`\`

または、初期値を設定する方法もあります：

\`\`\`typescript
const [users, setUsers] = useState<User[]>([]);
\`\`\``,
    expectedMessages: [
        { role: 'user', text: 'これが出た' },
        { role: 'user', text: 'TypeError: Cannot read properties' },
        { role: 'ai', text: 'このエラーは' },
    ],
    expectedBoundaryCount: 3,
};

// ── Test Case 10: Short rapid-fire Q&A ──
const tc10_rapidFire: TestCase = {
    id: 'tc10',
    name: 'Rapid-fire Q&A',
    description: 'Very short user questions with brief AI answers',
    rawText: `npmとyarnどっちがいい？

どちらも優れたパッケージマネージャーですが、2024年以降は **npm** が推奨されています。npm 7以降でworkspacesもサポートされ、yarnとの機能差は縮小しています。

pnpmは？

pnpmは非常に優秀な選択肢です。ディスク容量を大幅に節約でき、インストール速度も最速クラスです。monorepoにも強いです。

Bunは？

Bunは新しいJavaScriptランタイム兼パッケージマネージャーです。非常に高速ですが、まだ本番環境での採用実績は少ないです。個人プロジェクトなら試す価値があります。

じゃあpnpmで行く

良い選択です！pnpmを使い始めるには：

\`\`\`bash
npm install -g pnpm
pnpm init
pnpm add react react-dom
\`\`\``,
    expectedMessages: [
        { role: 'user', text: 'npmとyarnどっちがいい？' },
        { role: 'ai', text: 'どちらも優れたパッケージマネージャーですが' },
        { role: 'user', text: 'pnpmは？' },
        { role: 'ai', text: 'pnpmは非常に優秀な選択肢です。' },
        { role: 'user', text: 'Bunは？' },
        { role: 'ai', text: 'Bunは新しいJavaScriptランタイム兼パッケージマネージャーです。' },
        { role: 'user', text: 'じゃあpnpmで行く' },
        { role: 'ai', text: '良い選択です！pnpmを使い始めるには：' },
    ],
    expectedBoundaryCount: 8,
};

/**
 * All test cases.
 */
export const TEST_CASES: TestCase[] = [
    tc01_simpleMarked,
    tc02_noMarkers,
    tc03_errorDebug,
    tc04_multiTurn,
    tc05_claudeMarkers,
    tc06_chatgptMarkers,
    tc07_mixedLang,
    tc08_longResponse,
    tc09_errorLog,
    tc10_rapidFire,
];
