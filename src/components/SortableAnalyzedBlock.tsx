import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnalyzedBlock } from './AnalyzedBlock';
import { GripVertical } from 'lucide-react';
import type { AnalyzedMessage } from '../algorithm';

export function SortableAnalyzedBlock(props: {
    msg: AnalyzedMessage;
    onRoleToggle: (id: number) => void;
    onMergeWithPrev: (id: number) => void;
    onUpdateText: (id: number, newText: string) => void;
    onUpdateTopics: (id: number, topics: string[]) => void;
    isFirst: boolean;
    forceExpand?: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: props.msg.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 1000 : 1,
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className="sortable-block-wrapper">
            <div className="drag-handle no-print" {...attributes} {...listeners}>
                <GripVertical size={14} />
            </div>
            <AnalyzedBlock {...props} />
        </div>
    );
}
