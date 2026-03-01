import { FileDown } from 'lucide-react';

interface FloatingButtonProps {
  onClick: () => void;
}

export function FloatingButton({ onClick }: FloatingButtonProps) {
  return (
    <button className="gpt-export-fab" onClick={onClick} title="Export conversation">
      <FileDown size={16} strokeWidth={2.5} />
      Export Doc
    </button>
  );
}
