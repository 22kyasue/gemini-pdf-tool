import type { ShareTurn } from '../utils/shareImport';
import { ContentRenderer } from './ContentRenderer';

interface SharePdfDocumentProps {
  title: string;
  turns: ShareTurn[];
  platform: string;
  sourceUrl?: string;
}

/**
 * Chat2Doc-style layout rendered off-screen for PDF capture.
 *
 * IMPORTANT: Returns a fragment so each section becomes a direct child
 * of the container div. This lets exportToPdf's chunking logic treat
 * each turn as a separate block — critical for long conversations that
 * would otherwise exceed the 14,000px canvas limit.
 */
export function SharePdfDocument({ title, turns, platform, sourceUrl }: SharePdfDocumentProps) {
  const dateStr = new Date().toLocaleDateString('en-CA'); // ISO: YYYY-MM-DD

  return (
    <>
      {/* ─── Simple header (matches ideal) ─── */}
      <div className="share-pdf-top-header">
        <div className="share-pdf-top-subtitle">
          This is a copy of a conversation between {platform} &amp; Anonymous.
        </div>
        <div className="share-pdf-top-report">Report conversation</div>
      </div>

      {/* ─── Date row with dashed line ─── */}
      <div className="share-pdf-date-row">
        <span className="share-pdf-date-text"><strong>Date:</strong> {dateStr}</span>
        <div className="share-pdf-date-dashed" />
      </div>

      {/* ─── Table of Contents ─── */}
      <div className="share-pdf-toc">
        <h2 className="share-pdf-toc-heading">Table of Contents</h2>
        <ol className="share-pdf-toc-list">
          {turns.map((turn, i) => {
            const isUser = turn.role === 'user';
            const role = isUser ? 'You said' : `${platform} said`;
            const preview = turn.content.slice(0, 55).replace(/\n/g, ' ');
            return (
              <li key={i} className="share-pdf-toc-item">
                <span className="share-pdf-toc-num">{i + 1}.</span>
                <span className={`share-pdf-toc-role ${isUser ? 'toc-role-user' : 'toc-role-ai'}`}>
                  {role}:
                </span>
                <span className="share-pdf-toc-preview">
                  {preview}{turn.content.length > 55 ? '...' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ─── Conversation turns — each is a direct child for chunking ─── */}
      {turns.map((turn, i) => {
        const isUser = turn.role === 'user';
        const hasImage = turn.content.includes('Uploaded an image');

        return (
          <div
            className={`share-pdf-turn ${isUser ? 'share-turn-user' : 'share-turn-ai'}`}
            key={i}
          >
            {/* Dashed separator between turns */}
            {i > 0 && isUser && <div className="share-pdf-turn-separator" />}

            {isUser ? (
              <div className="share-pdf-user-area">
                {hasImage && (
                  <div className="share-pdf-image-badge">
                    <span className="share-pdf-image-icon">&#128444;</span>
                    <span>Uploaded an image</span>
                  </div>
                )}
                <div className="share-pdf-user-bubble">
                  {turn.content.replace('Uploaded an image', '').trim()}
                </div>
              </div>
            ) : (
              <div className="share-pdf-ai-content">
                <ContentRenderer content={turn.content} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
