import { BookOpen, ChevronRight, Zap } from 'lucide-react';
import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ResourceBreadcrumbs } from '@/components/resources/ResourceBreadcrumbs';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getSectionBySlug } from '@/lib/resources/catalogue';

export const SectionPage: React.FC = () => {
  const { sectionSlug } = useParams<{ sectionSlug: string }>();
  const section = sectionSlug ? getSectionBySlug(sectionSlug) : undefined;

  usePageMeta({
    title: section ? `${section.name} Study Notes & Practice Topics` : 'Free Aptitude Resources – Aptric',
    description: section ? `Free study materials and formula guides for ${section.name}. Covers ${section.topics
      .map((t) => t.name)
      .join(', ')} for placements and competitive exams.` : 'Browse free aptitude learning resources and topic guides.',
    canonicalPath: section ? `/resources/${section.slug}` : '/resources',
    structuredData: section ? {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${section.name} Resources – Aptric`,
      description: section.description,
      url: `https://aptric.app/resources/${section.slug}`,
    } : undefined,
  });

  if (!section) {
    return <Navigate to="/resources" replace />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <ResourceBreadcrumbs items={[{ label: section.name }]} />

      <header className="mb-10 pb-8 border-b border-[var(--border)]">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--foreground)] tracking-tight mb-3">
          {section.name}
        </h1>
        <p className="text-base sm:text-lg text-[var(--muted-foreground)] max-w-3xl leading-relaxed">
          {section.description}
        </p>
      </header>

      {/* Topics & Subtopics Grid */}
      <div className="space-y-12">
        {section.topics.map((topic) => (
          <section key={topic.slug} id={topic.slug} className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
                  {topic.name}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--muted-foreground)]">{topic.description}</p>
              </div>
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                {topic.subtopics.length} Subtopics
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topic.subtopics.map((st) => (
                <Link
                  key={st.slug}
                  to={`/resources/${section.slug}/${topic.slug}/${st.slug}`}
                  className="flex flex-col p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs hover:border-[var(--primary)]/50 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm sm:text-base text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                      {st.name}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2 mb-3">
                    {st.description}
                  </p>
                  <div className="mt-auto flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]">
                    <BookOpen className="w-3 h-3" />
                    <span>Study Concept & Practice</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Trial Call to Action */}
      <div className="mt-16 p-6 sm:p-8 rounded-3xl bg-[var(--card)] border border-[var(--primary)]/20 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
        <div>
          <h3 className="text-lg font-bold text-[var(--foreground)] mb-1">
            Ready to test your {section.name} skills?
          </h3>
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)]">
            Practice 10 real questions in our timed solver with instant explanations.
          </p>
        </div>
        <Link
          to="/free-trial"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-[var(--primary)] text-white shadow-xs hover:opacity-90 transition-opacity shrink-0"
        >
          <Zap className="w-4 h-4" />
          <span>Start Free Trial</span>
        </Link>
      </div>
    </div>
  );
};
