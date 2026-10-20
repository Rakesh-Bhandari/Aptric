import {
  ArrowRight,
  BarChart2,
  BookOpen,
  Brain,
  Calculator,
  Code,
  GraduationCap,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getAllSections, searchCatalogue } from '@/lib/resources/catalogue';

export const ResourceHub: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const sections = useMemo(() => getAllSections(), []);
  const searchResults = useMemo(() => searchCatalogue(searchQuery), [searchQuery]);

  usePageMeta({
    title: 'Free Aptitude Learning Resources & Study Notes',
    description:
      'Free, comprehensive, indexable aptitude study guides covering Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation, and Technical CS fundamentals for campus placements and competitive exams.',
    canonicalPath: '/resources',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Aptric Aptitude Learning Resources',
      description:
        'Comprehensive, free aptitude learning modules for campus placements (TCS NQT, Infosys, Cognizant, Wipro) and competitive tests (CAT, Bank PO).',
      url: 'https://aptric.app/resources',
      publisher: {
        '@type': 'Organization',
        name: 'Aptric',
        url: 'https://aptric.app/',
      },
    },
  });

  const getSectionIcon = (iconName: string) => {
    switch (iconName) {
      case 'Calculator':
        return <Calculator className="w-5 h-5 text-blue-500" />;
      case 'Brain':
        return <Brain className="w-5 h-5 text-purple-500" />;
      case 'BookOpen':
        return <BookOpen className="w-5 h-5 text-emerald-500" />;
      case 'BarChart2':
        return <BarChart2 className="w-5 h-5 text-amber-500" />;
      case 'Code':
        return <Code className="w-5 h-5 text-cyan-500" />;
      default:
        return <GraduationCap className="w-5 h-5 text-[var(--accent)]" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      {/* Header Banner */}
      <header className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--primary)]/10 text-[var(--accent)] text-xs font-semibold mb-4 border border-[var(--primary)]/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>100% Free Educational Knowledge Hub</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-[var(--foreground)] tracking-tight mb-4">
          Master Aptitude for Placements and Exams
        </h1>
        <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed mb-6">
          Original study notes, worked examples, formulas, and practice checkpoints. Editorial review is ongoing.
          Completely free without requiring an account.
        </p>

        {/* Quick CTA to 10-Question Trial */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/free-trial"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-[var(--gradient-primary)] text-white shadow-md hover:opacity-95 transition-all"
          >
            <Zap className="w-4 h-4" />
            <span>Try 10 Questions Free</span>
          </Link>
          <a
            href="#sections-grid"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] transition-colors text-[var(--foreground)]"
          >
            <span>Browse All Subjects</span>
            <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
          </a>
        </div>
      </header>

      {/* Global Search Bar */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <Search className="w-5 h-5 text-[var(--muted-foreground)] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics (e.g., percentages, syllogism, time and work, bar charts)..."
            className="w-full pl-11 pr-4 py-3.5 text-sm sm:text-base rounded-2xl bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] shadow-xs focus:outline-hidden focus:ring-2 focus:ring-[var(--primary)] transition-all"
          />
        </div>

        {/* Live Search Results */}
        {searchQuery.trim().length > 0 && (
          <div className="mt-3 p-3 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-lg animate-in fade-in duration-100 divide-y divide-[var(--border)] max-h-96 overflow-y-auto">
            {searchResults.length > 0 ? (
              searchResults.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className="block p-3 rounded-xl hover:bg-[var(--secondary)]/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-sm text-[var(--foreground)]">
                      {item.title}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--primary)]/10 text-[var(--accent)]">
                      {item.badgeText}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] line-clamp-1">{item.description}</p>
                </Link>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                No matching topics found for "{searchQuery}". Try searching for concepts like "percentages", "syllogisms", or "OOP".
              </div>
            )}
          </div>
        )}
      </div>

      {/* Curated 5 Core Sections */}
      <section id="sections-grid" className="space-y-10">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
            Explore by Subject Area
          </h2>
          <span className="text-xs text-[var(--muted-foreground)] font-medium">5 Canonical Tracks</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sections.map((sec) => (
            <div
              key={sec.slug}
              className="flex flex-col p-6 rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-xs hover:shadow-md hover:border-[var(--primary)]/30 transition-all group"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)]">
                  {getSectionIcon(sec.iconName)}
                </div>
                <Link
                  to={`/resources/${sec.slug}`}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  <span>View All</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>

              <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
                <Link to={`/resources/${sec.slug}`} className="hover:text-[var(--accent)] transition-colors">
                  {sec.name}
                </Link>
              </h3>
              <p className="text-xs sm:text-sm text-[var(--muted-foreground)] mb-5 leading-relaxed">
                {sec.description}
              </p>

              {/* Subtopics snippet */}
              <div className="mt-auto pt-4 border-t border-[var(--border)]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] block mb-2">
                  Featured Topics:
                </span>
                <ul className="space-y-1.5">
                  {sec.topics.flatMap((t) => t.subtopics).slice(0, 4).map((st) => (
                    <li key={st.slug}>
                      <Link
                        to={`/resources/${sec.slug}/${st.topicSlug}/${st.slug}`}
                        className="text-xs text-[var(--foreground)] hover:text-[var(--accent)] flex items-center justify-between py-1 group/item"
                      >
                        <span className="truncate pr-2">{st.name}</span>
                        <ArrowRight className="w-3 h-3 text-[var(--muted-foreground)] group-hover/item:translate-x-0.5 group-hover/item:text-[var(--accent)] transition-all shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust & Methodology Banner */}
      <section className="mt-16 p-6 sm:p-8 rounded-3xl bg-[var(--secondary)]/30 border border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-[var(--foreground)]">Editorial transparency</h4>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Content is being expanded and reviewed. Please report any suspected error using the feedback form on each article.
            </p>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-[var(--foreground)]">First-Principles Teaching</h4>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              We teach why formulas work and explain the exact conditions where shortcuts succeed or fail.
            </p>
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-[var(--foreground)]">Practice Real Questions</h4>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Test your knowledge immediately in the interactive solver without creating an account.
            </p>
          </div>
        </div>
      </section>

      {/* Solver Trial Banner */}
      <section className="mt-12 text-center p-8 sm:p-10 rounded-3xl bg-linear-to-b from-[var(--primary)]/10 to-[var(--card)] border border-[var(--primary)]/20 shadow-sm">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--foreground)] mb-3">
          Test Your Skills with 10 Free Questions
        </h2>
        <p className="text-sm sm:text-base text-[var(--muted-foreground)] max-w-xl mx-auto mb-6">
          Experience Aptric's actual solving engine with full timer controls, instant feedback, and stored explanations.
        </p>
        <Link
          to="/free-trial"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-[var(--primary)] text-white shadow-md hover:opacity-90 transition-opacity"
        >
          <Zap className="w-4 h-4" />
          <span>Launch 10-Question Trial</span>
        </Link>
      </section>
    </div>
  );
};
