import { List } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export interface TocSection {
  id: string;
  label: string;
}

interface ResourceTableOfContentsProps {
  sections: TocSection[];
}

export const ResourceTableOfContents: React.FC<ResourceTableOfContentsProps> = ({ sections }) => {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id || '');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop <= scrollPosition) {
          setActiveId(sections[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollTo = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setActiveId(id);
    }
  };

  return (
    <nav
      aria-label="Table of contents"
      className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs sticky top-20"
    >
      <div className="flex items-center gap-2 font-semibold text-sm text-[var(--foreground)] pb-2 mb-3 border-b border-[var(--border)]">
        <List className="w-4 h-4 text-[var(--accent)]" />
        <span>On this page</span>
      </div>
      <ul className="space-y-1.5 text-xs sm:text-sm">
        {sections.map((sec) => {
          const isActive = activeId === sec.id;
          return (
            <li key={sec.id}>
              <a
                href={`#${sec.id}`}
                onClick={(e) => scrollTo(sec.id, e)}
                className={`block py-1 px-2 rounded-lg transition-colors ${
                  isActive
                    ? 'font-medium text-[var(--accent)] bg-[var(--primary)]/10'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/50'
                }`}
              >
                {sec.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
