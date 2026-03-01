import type { ShareTurn } from '../utils/shareImport';
import { ContentRenderer } from './ContentRenderer';
import { FileText, Globe, Calendar, List, User, Bot } from 'lucide-react';

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
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {/* ─── CHATSOURCE Branding Header ─── */}
      <div className="share-pdf-brand">
        <div className="share-pdf-brand-top">
          <div className="share-pdf-brand-left">
            <FileText size={22} color="#4f46e5" />
            <div>
              <div className="share-pdf-brand-main">CHATSOURCE</div>
              <div className="share-pdf-brand-sub">AI Chat Export</div>
            </div>
          </div>
          <div className="share-pdf-brand-meta">
            <div className="share-pdf-meta-item">
              <Globe size={10} />
              <span>Source: {platform}</span>
            </div>
            <div className="share-pdf-meta-item">
              <Calendar size={10} />
              <span>Exported: {dateStr}</span>
            </div>
          </div>
        </div>
        <div className="share-pdf-brand-line" />
      </div>

      {/* ─── Document Title + Subtitle ─── */}
      <div className="share-pdf-header">
        <div className="share-pdf-title">{title}</div>
        <div className="share-pdf-header-text">
          This is a copy of a conversation between {platform} & Anonymous.
        </div>
        {sourceUrl && (
          <div className="share-pdf-source">Source: {sourceUrl}</div>
        )}
      </div>

      {/* ─── Table of Contents (card style) ─── */}
      <div className="share-pdf-toc">
        <div className="share-pdf-toc-header">
          <List size={14} />
          <span>Table of Contents</span>
        </div>
        <ol className="share-pdf-toc-list">
          {turns.map((turn, i) => {
            const isUser = turn.role === 'user';
            const role = isUser ? 'You' : platform;
            const preview = turn.content.slice(0, 60).replace(/\n/g, ' ');
            return (
              <li key={i} className="share-pdf-toc-item">
                <span className="share-pdf-toc-num">{i + 1}.</span>
                <span className={`share-pdf-toc-role ${isUser ? 'toc-role-user' : 'toc-role-ai'}`}>
                  {role}:
                </span>
                <span className="share-pdf-toc-preview">
                  {preview}{turn.content.length > 60 ? '...' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ─── Conversation turns — each is a direct child for chunking ─── */}
      {turns.map((turn, i) => {
        const isUser = turn.role === 'user';
        return (
          <div
            className={`share-pdf-turn ${isUser ? 'share-turn-user' : 'share-turn-ai'}`}
            key={i}
          >
            <div className={`share-pdf-label ${isUser ? 'share-label-user' : 'share-label-ai'}`}>
              <span className={`share-pdf-pill ${isUser ? 'share-pill-user' : 'share-pill-ai'}`}>
                {isUser ? <User size={11} /> : <Bot size={11} />}
                {isUser ? 'USER' : platform.toUpperCase()}
              </span>
            </div>
            <div className="share-pdf-content">
              <ContentRenderer content={turn.content} />
            </div>
          </div>
        );
      })}
    </>
  );
}
