import { ChevronRight, Home } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ResourceBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export const ResourceBreadcrumbs: React.FC<ResourceBreadcrumbsProps> = ({ items }) => {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center text-sm text-[var(--muted)]">
      <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <li className="inline-flex items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span className="sr-only">Home</span>
          </Link>
        </li>

        <li className="inline-flex items-center text-slate-400">
          <ChevronRight className="w-3.5 h-3.5" />
        </li>

        <li className="inline-flex items-center">
          <Link
            to="/resources"
            className="hover:text-[var(--accent)] transition-colors"
          >
            Resources
          </Link>
        </li>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={item.label}>
              <li className="inline-flex items-center text-slate-400">
                <ChevronRight className="w-3.5 h-3.5" />
              </li>
              <li className="inline-flex items-center">
                {isLast || !item.href ? (
                  <span
                    className="font-medium text-[var(--foreground)] truncate max-w-[200px] sm:max-w-xs"
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.href}
                    className="hover:text-[var(--accent)] transition-colors truncate max-w-[150px] sm:max-w-xs"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
};
