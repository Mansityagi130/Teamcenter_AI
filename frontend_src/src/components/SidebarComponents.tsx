import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ==========================================
// 1. COLLAPSIBLE SIDEBAR FOLDER
// ==========================================
interface SidebarFolderProps {
  label: string;
  icon: string;
  folderId: string;
  active?: boolean;
  collapsed?: boolean;
  children: React.ReactNode;
}

export function SidebarFolder({ label, icon, folderId, active = false, collapsed = false, children }: SidebarFolderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click was outside category container and outside flyout portal
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('.flyout-menu-portal')
      ) {
        setIsOpen(false);
      }
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, { capture: true });
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const flyoutWidth = 240; // width of flyout panel
      const spaceOnRight = viewportWidth - rect.right;
      const positionLeft = spaceOnRight < flyoutWidth + 16;
      
      const left = positionLeft 
        ? rect.left - flyoutWidth - 8 
        : rect.right + 8;
        
      setCoords({
        top: rect.top,
        left
      });
    }
  }, [isOpen]);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div ref={containerRef} className={`relative w-full flex flex-col items-center ${
      collapsed ? '' : 'mt-3.5'
    }`}>
      {/* Category Toggle Button */}
      {collapsed ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleOpen}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors outline-none mx-auto relative ${
            active || isOpen
              ? 'tab-link-active text-secondary-fixed-dim'
              : 'text-on-surface-variant hover:bg-surface-variant/30'
          }`}
          title={label}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleOpen}
          className={`flex items-center justify-between w-full px-md py-2 rounded-lg text-left transition-all duration-150 outline-none ${
            active || isOpen
              ? 'tab-link-active text-secondary-fixed-dim font-bold'
              : 'text-on-surface-variant font-medium hover:bg-surface-variant/30 active:scale-98'
          }`}
        >
          <div className="flex items-center gap-md">
            <span className="material-symbols-outlined text-lg opacity-80">{icon}</span>
            <span className="text-sm select-none font-bold">{label}</span>
          </div>
          <span className="material-symbols-outlined text-sm text-outline select-none opacity-80">
            chevron_right
          </span>
        </button>
      )}

      {/* Flyout Menu Panel (rendered inside a portal at document body) */}
      {isOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: '240px',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          }}
          className="flyout-menu-portal bg-surface-container-high border border-outline-variant/20 z-[100] px-1.5 py-1.5 flyout-slide-in flex flex-col gap-1"
        >
          <div onClick={() => setIsOpen(false)} className="flex flex-col gap-1">
            {children}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ==========================================
// 2. FOLDER MENU ITEM
// ==========================================
interface SidebarFolderItemProps {
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
  onClick: () => void;
}

export function SidebarFolderItem({ label, icon, active, badge, onClick }: SidebarFolderItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-md px-3 py-1 rounded-md text-left transition-all duration-150 outline-none w-full ${
        active
          ? 'tab-link-active text-secondary-fixed-dim font-bold bg-secondary-container/5'
          : 'text-on-surface-variant font-medium hover:bg-surface-variant/20 active:scale-98'
      }`}
    >
      <span className="material-symbols-outlined text-[15px] opacity-70 select-none">{icon}</span>
      <span className="text-xs truncate flex-1">{label}</span>
      {badge && (
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-secondary-container/20 text-secondary-fixed-dim select-none mr-1">
          {badge}
        </span>
      )}
    </button>
  );
}

// ==========================================
// 3. DATE GROUPING & SORTING FOR SESSIONS
// ==========================================
export interface Session {
  session_id: string;
  title: string;
  last_active?: string;
}

export function groupSessionsByDate(sessions: Session[], pinnedSessionIds: string[]) {
  const groups: {
    today: Session[];
    yesterday: Session[];
    last7Days: Session[];
    older: Session[];
  } = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  
  const startOfLast7Days = new Date(startOfToday);
  startOfLast7Days.setDate(startOfLast7Days.getDate() - 7);

  sessions.forEach(session => {
    let dateStr = session.last_active;
    if (dateStr && !dateStr.includes('T') && !dateStr.includes('Z')) {
      dateStr = dateStr.replace(' ', 'T') + 'Z';
    }
    const activeDate = dateStr ? new Date(dateStr) : new Date();

    if (activeDate >= startOfToday) {
      groups.today.push(session);
    } else if (activeDate >= startOfYesterday) {
      groups.yesterday.push(session);
    } else if (activeDate >= startOfLast7Days) {
      groups.last7Days.push(session);
    } else {
      groups.older.push(session);
    }
  });

  const sortPinnedToTop = (arr: Session[]) => {
    return [...arr].sort((a, b) => {
      const aPinned = pinnedSessionIds.includes(a.session_id) ? 1 : 0;
      const bPinned = pinnedSessionIds.includes(b.session_id) ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned; // Pinned first
      }
      return 0; // Keep order
    });
  };

  return {
    today: sortPinnedToTop(groups.today),
    yesterday: sortPinnedToTop(groups.yesterday),
    last7Days: sortPinnedToTop(groups.last7Days),
    older: sortPinnedToTop(groups.older),
  };
}

// ==========================================
// 4. LOCAL HEURISTIC CHAT TITLE EXTRACTOR
// ==========================================
export function generateLocalTitle(message: string): string {
  const cleanMsg = message.trim().replace(/[\s\n\r]+/g, ' ');
  
  // 1. Check for specific common patterns
  
  // Pattern: Compare revision X and revision Y of Z
  const compareRegex = /compare\s+revisions?\s+([a-zA-Z0-9_-]+)\s+and\s+([a-zA-Z0-9_-]+)\s+of\s+([a-zA-Z0-9_\s-]+)/i;
  const compareMatch = cleanMsg.match(compareRegex);
  if (compareMatch) {
    return `Compare ${compareMatch[3].trim()} Revisions`;
  }
  
  // Generic Compare pattern
  const compareGenericRegex = /compare\s+([a-zA-Z0-9_\s-]+)/i;
  const compareGenericMatch = cleanMsg.match(compareGenericRegex);
  if (compareGenericMatch) {
    const target = compareGenericMatch[1].trim();
    return `Compare ${target.length > 25 ? target.substring(0, 25) + '...' : target}`;
  }
  
  // Pattern: Show me all CAD datasets related to Z
  const cadRegex = /(?:show|find|get|list|display)\s+(?:all\s+)?(?:cad\s+)?datasets?\s+(?:related\s+to|for|of)\s+([a-zA-Z0-9_\s-]+)/i;
  const cadMatch = cleanMsg.match(cadRegex);
  if (cadMatch) {
    return `CAD Datasets for ${cadMatch[1].trim()}`;
  }
  
  // Pattern: Find workflow status for Item Z
  const workflowRegex = /(?:find|get|show|check)\s+workflow\s+status\s+(?:for|of)\s+([a-zA-Z0-9_\s-]+)/i;
  const workflowMatch = cleanMsg.match(workflowRegex);
  if (workflowMatch) {
    return `Workflow Status for ${workflowMatch[1].trim()}`;
  }
  
  // Pattern: Find BOM for Z
  const bomRegex = /(?:find|get|show|bom\s+for|bill\s+of\s+materials\s+for)\s+([a-zA-Z0-9_\s-]+)/i;
  const bomMatch = cleanMsg.match(bomRegex);
  if (bomMatch) {
    return `BOM for ${bomMatch[1].trim()}`;
  }

  // Pattern: Dataset search for Z
  const datasetSearchRegex = /dataset\s+search\s+for\s+([a-zA-Z0-9_\s-]+)/i;
  const datasetSearchMatch = cleanMsg.match(datasetSearchRegex);
  if (datasetSearchMatch) {
    return `Dataset Search for ${datasetSearchMatch[1].trim()}`;
  }
  
  // 2. Clean conversational prefixes and take the first 4-7 meaningful words
  const words = cleanMsg.split(' ').filter(w => w.length > 0);
  const ignorePrefixes = new Set([
    'can', 'you', 'please', 'show', 'me', 'find', 'get', 'list', 'i', 'want', 'to', 'could', 'how', 'do', 'we'
  ]);
  let startIndex = 0;
  while (startIndex < words.length && ignorePrefixes.has(words[startIndex].toLowerCase())) {
    startIndex++;
  }
  
  const meaningfulWords = words.slice(startIndex, startIndex + 6);
  if (meaningfulWords.length >= 3) {
    let title = meaningfulWords.join(' ');
    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (title.length > 45) {
      title = title.substring(0, 42) + '...';
    }
    return title;
  }
  
  // 3. Fallback: first 40-60 characters
  if (cleanMsg.length > 45) {
    return cleanMsg.substring(0, 42) + '...';
  }
  return cleanMsg;
}
