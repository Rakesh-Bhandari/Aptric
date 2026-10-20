import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookCheck,
  CheckCircle,
  Clock,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Zap,
} from 'lucide-react';
import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Markdown } from '@/components/markdown/Markdown';
import { FeedbackAffordance } from '@/components/resources/FeedbackAffordance';
import { PracticeCheckpoint } from '@/components/resources/PracticeCheckpoint';
import { ResourceBreadcrumbs } from '@/components/resources/ResourceBreadcrumbs';
import { ResourceTableOfContents, type TocSection } from '@/components/resources/ResourceTableOfContents';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getEducationalTopicContent } from '@/lib/resources/contentRegistry';

export const TopicPage: React.FC = () => {
  const { subtopicSlug, topicSlug } = useParams<{
    topicSlug?: string;
    subtopicSlug?: string;
  }>();

  // Resolve subtopic slug whether accessed via /resources/:sectionSlug/:topicSlug/:subtopicSlug or /resources/:sectionSlug/:subtopicSlug
  const resolvedSubtopicSlug = subtopicSlug || topicSlug;
  const content = resolvedSubtopicSlug ? getEducationalTopicContent(resolvedSubtopicSlug) : undefined;

  usePageMeta({
    title: content ? `${content.title} – Aptric Resources` : 'Free Aptitude Resources – Aptric',
    description: content ? `${content.introduction.slice(0, 155)}... Study guide with formulas, step-by-step worked examples, and practice problems.` : 'Browse free aptitude learning resources and topic guides.',
    canonicalPath: content ? `/resources/${content.sectionSlug}/${content.topicSlug}/${content.subtopicSlug}` : '/resources',
    noindex: true, // Do not index article drafts until a competent editor completes the review.
    structuredData: content ? [
      {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: content.title,
        description: content.introduction,
        educationalLevel: 'Undergraduate / Placement Screening',
        learningResourceType: 'Study Guide',
        url: `https://aptric.app/resources/${content.sectionSlug}/${content.topicSlug}/${content.subtopicSlug}`,
        publisher: {
          '@type': 'Organization',
          name: 'Aptric',
          url: 'https://aptric.app/',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Resources',
            item: 'https://aptric.app/resources',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: content.sectionName,
            item: `https://aptric.app/resources/${content.sectionSlug}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: content.subtopicName,
            item: `https://aptric.app/resources/${content.sectionSlug}/${content.topicSlug}/${content.subtopicSlug}`,
          },
        ],
      },
    ] : undefined,
  });

  if (!content) {
    return <Navigate to="/resources" replace />;
  }

  const tocSections: TocSection[] = [
    { id: 'introduction', label: 'Overview' },
    { id: 'core-concepts', label: 'Core Concepts' },
    { id: 'formulas', label: 'Formulas & Definitions' },
    { id: 'worked-examples', label: 'Worked Examples' },
    { id: 'shortcuts', label: 'Shortcuts & Methods' },
    { id: 'tips-and-tricks', label: 'Tips & Tricks' },
    { id: 'common-mistakes', label: 'Common Mistakes' },
    { id: 'difficulty-guide', label: 'Difficulty Guide' },
    { id: 'practice-checkpoint', label: 'Practice Checkpoint' },
    { id: 'revision-summary', label: 'Quick Revision' },
    { id: 'faqs', label: 'Frequently Asked Questions' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
      {/* Breadcrumb Trail */}
      <ResourceBreadcrumbs
        items={[
          { label: content.sectionName, href: `/resources/${content.sectionSlug}` },
          { label: content.topicName, href: `/resources/${content.sectionSlug}#${content.topicSlug}` },
          { label: content.subtopicName },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content Area (3 Cols) */}
        <article className="lg:col-span-3 space-y-12 min-w-0">
          {/* Header */}
          <header className="space-y-4 pb-8 border-b border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--accent)]">
                {content.sectionName} › {content.topicName}
              </span>
              <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 12 min read
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-[var(--foreground)] tracking-tight leading-tight">
              {content.title}
            </h1>

            {/* Learning Objective Callout */}
            <div className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--primary)]/20 shadow-xs flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block mb-0.5">
                  Learning Objective
                </span>
                <p className="text-xs sm:text-sm text-[var(--foreground)] font-medium leading-relaxed">
                  {content.learningObjective}
                </p>
              </div>
            </div>
          </header>

          {/* 1. Introduction & Overview */}
          <section id="introduction" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Introduction</h2>
            <div className="text-sm sm:text-base text-[var(--foreground)] leading-relaxed space-y-3">
              <Markdown text={content.introduction} />
            </div>

            {content.prerequisites && content.prerequisites.length > 0 && (
              <div className="p-4 rounded-xl bg-[var(--secondary)]/40 border border-[var(--border)]">
                <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block mb-2">
                  Prerequisites for this Topic:
                </span>
                <ul className="flex flex-wrap gap-2 text-xs">
                  {content.prerequisites.map((p, idx) => (
                    <li key={idx} className="inline-flex">
                      {p.href ? (
                        <Link
                          to={p.href}
                          className="px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--accent)] hover:underline"
                        >
                          {p.title}
                        </Link>
                      ) : (
                        <span className="px-2.5 py-1 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]">
                          {p.title}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* 2. Core Concepts */}
          <section id="core-concepts" className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">Core Concepts</h2>
            <div className="space-y-4">
              {content.coreConcepts.map((concept, index) => (
                <div
                  key={index}
                  className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-2"
                >
                  <h3 className="text-base sm:text-lg font-semibold text-[var(--foreground)]">
                    {concept.heading}
                  </h3>
                  <div className="text-sm sm:text-base text-[var(--foreground)] leading-relaxed">
                    <Markdown text={concept.body} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Definitions and Formulas */}
          <section id="formulas" className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
              Formulas & Mathematical Notation
            </h2>

            {content.definitionsAndNotation.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[var(--secondary)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                    <tr>
                      <th className="p-3 font-semibold w-1/3">Term / Symbol</th>
                      <th className="p-3 font-semibold">Rigorous Definition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
                    {content.definitionsAndNotation.map((def, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-medium align-top">
                          <Markdown text={def.term} />
                        </td>
                        <td className="p-3 leading-relaxed">
                          <Markdown text={def.definition} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {content.formulas.map((form, index) => (
                <div
                  key={index}
                  className="p-5 rounded-2xl bg-[var(--secondary)]/30 border border-[var(--border)] space-y-2.5"
                >
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block">
                    {form.name}
                  </span>
                  <div className="p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] text-sm sm:text-base font-semibold overflow-x-auto text-[var(--foreground)]">
                    <Markdown text={`$$${form.formula}$$`} />
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{form.explanation}</p>
                  {form.assumptions && (
                    <p className="text-[11px] text-[var(--muted-foreground)] italic">
                      Condition: {form.assumptions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 4. Step-by-Step Worked Examples */}
          <section id="worked-examples" className="space-y-6">
            <div className="flex items-baseline justify-between border-b border-[var(--border)] pb-2">
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
                Step-by-Step Worked Examples
              </h2>
              <span className="text-xs text-[var(--muted-foreground)] font-medium">Difficulty Progression</span>
            </div>

            <div className="space-y-6">
              {content.workedExamples.map((ex, index) => (
                <div
                  key={index}
                  className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--foreground)]">
                      {ex.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      {ex.examContext && (
                        <span className="text-[11px] text-[var(--muted-foreground)] hidden sm:inline">
                          {ex.examContext}
                        </span>
                      )}
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          ex.difficulty === 'easy'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : ex.difficulty === 'medium'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ex.difficulty.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--secondary)]/50 border border-[var(--border)] text-sm sm:text-base font-medium text-[var(--foreground)]">
                    <Markdown text={ex.question} />
                  </div>

                  <div className="text-xs sm:text-sm text-[var(--foreground)] space-y-2 leading-relaxed">
                    <span className="font-semibold text-xs text-[var(--accent)] block uppercase tracking-wider">
                      Step-by-Step Reasoning:
                    </span>
                    <Markdown text={ex.solution} />
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Independent Verification:</span>
                    </div>
                    <Markdown text={ex.verification} />
                  </div>

                  <div className="text-right text-xs font-bold text-[var(--foreground)]">
                    Final Answer: <span className="text-[var(--accent)] font-mono">{ex.answer}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Alternative Methods & Shortcuts */}
          <section id="shortcuts" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
              Alternative Methods & Shortcuts
            </h2>
            <div className="space-y-4">
              {content.alternativeMethods.map((alt, index) => (
                <div
                  key={index}
                  className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h3 className="font-bold text-sm sm:text-base text-[var(--foreground)]">
                      {alt.name}
                    </h3>
                  </div>
                  <div className="text-xs sm:text-sm text-[var(--foreground)] leading-relaxed">
                    <Markdown text={alt.description} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                      <span className="font-semibold block mb-0.5">When Valid:</span>
                      <p>{alt.whenValid}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300">
                      <span className="font-semibold block mb-0.5">When It Fails:</span>
                      <p>{alt.whenItFails}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 6. Tips & Speed Tricks */}
          <section id="tips-and-tricks" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              <span>Speed Tricks & Pattern Recognition</span>
            </h2>
            <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs">
              <ul className="space-y-2.5 text-xs sm:text-sm text-[var(--foreground)]">
                {content.tipsAndTricks.map((tip, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0 mt-2" />
                    <div className="leading-relaxed">
                      <Markdown text={tip} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 7. Common Mistakes & Pitfalls */}
          <section id="common-mistakes" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500" />
              <span>Common Traps and Pitfalls</span>
            </h2>
            <div className="space-y-3">
              {content.commonMistakes.map((cm, index) => (
                <div
                  key={index}
                  className="p-4 sm:p-5 rounded-2xl bg-[var(--card)] border border-rose-500/20 space-y-2"
                >
                  <h3 className="font-bold text-xs sm:text-sm text-rose-600 dark:text-rose-400">
                    Trap: {cm.mistake}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                    <span className="font-semibold text-[var(--foreground)]">Why it happens:</span>{' '}
                    {cm.whyItHappens}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium leading-relaxed">
                    <span className="font-semibold">How to avoid:</span> {cm.howToAvoid}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 8. Difficulty Progression Guide */}
          <section id="difficulty-guide" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
              Difficulty Progression Guide
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[var(--secondary)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <tr>
                    <th className="p-3 font-semibold">Level</th>
                    <th className="p-3 font-semibold">Problem Characteristics</th>
                    <th className="p-3 font-semibold">Benchmark Exams</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
                  {content.difficultyProgression.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-semibold text-[var(--accent)]">{item.level}</td>
                      <td className="p-3 leading-relaxed">{item.characteristics}</td>
                      <td className="p-3 text-[var(--muted-foreground)]">{item.typicalExam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 9. Interactive Practice Checkpoint */}
          <section id="practice-checkpoint" className="space-y-4 pt-6 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
                  <BookCheck className="w-5 h-5 text-emerald-500" />
                  <span>Practice Checkpoint</span>
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  5 original diagnostic questions with instant verification.
                </p>
              </div>
            </div>

            <PracticeCheckpoint questions={content.practiceQuestions} />
          </section>

          {/* 10. Summary & Quick Revision Card */}
          <section id="revision-summary" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)]">
              Quick Revision Card
            </h2>
            <div className="p-5 sm:p-6 rounded-2xl bg-linear-to-br from-[var(--secondary)]/40 to-[var(--card)] border border-[var(--border)] shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] block mb-3">
                Key Takeaways in 30 Seconds:
              </span>
              <ul className="space-y-2 text-xs sm:text-sm text-[var(--foreground)] font-medium">
                {content.revisionSummary.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <Markdown text={item} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 11. FAQs */}
          <section id="faqs" className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-500" />
              <span>Frequently Asked Questions</span>
            </h2>
            <div className="space-y-3">
              {content.faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-2"
                >
                  <h3 className="font-semibold text-sm sm:text-base text-[var(--foreground)]">
                    {faq.question}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--muted-foreground)] leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Editorial Metadata Note */}
          <footer className="pt-6 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] flex flex-wrap items-center justify-between gap-3">
            {content.lastUpdated && <span>Last updated: {content.lastUpdated}</span>}
            <span>{content.editorialReview ?? 'Editorial review pending.'}</span>
          </footer>

          {/* Deterministic Previous / Next Navigation */}
          <nav
            aria-label="Previous and Next Subtopics"
            className="pt-6 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {content.previousSubtopic ? (
              <Link
                to={content.previousSubtopic.href}
                className="flex flex-col p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]/50 transition-all text-left group"
              >
                <span className="text-[11px] font-semibold text-[var(--muted-foreground)] flex items-center gap-1 mb-1">
                  <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Previous Topic</span>
                </span>
                <span className="font-bold text-sm text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                  {content.previousSubtopic.title}
                </span>
              </Link>
            ) : <div />}

            {content.nextSubtopic ? (
              <Link
                to={content.nextSubtopic.href}
                className="flex flex-col p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]/50 transition-all text-right group"
              >
                <span className="text-[11px] font-semibold text-[var(--muted-foreground)] flex items-center justify-end gap-1 mb-1">
                  <span>Next Topic</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
                <span className="font-bold text-sm text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                  {content.nextSubtopic.title}
                </span>
              </Link>
            ) : <div />}
          </nav>

          {/* Feedback Affordance */}
          <FeedbackAffordance topicTitle={content.subtopicName} />
        </article>

        {/* Sidebar (1 Col): TOC & Solver Trial CTA */}
        <aside className="lg:col-span-1 space-y-6">
          <ResourceTableOfContents sections={tocSections} />

          {/* Trial solver widget */}
          <div className="p-5 rounded-2xl bg-linear-to-b from-[var(--primary)]/10 to-[var(--card)] border border-[var(--primary)]/20 shadow-xs space-y-3 text-center">
            <Zap className="w-6 h-6 text-[var(--accent)] mx-auto" />
            <h3 className="font-bold text-sm text-[var(--foreground)]">
              Solve Real Exam Questions
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Test your skills with 10 questions in the official Aptric solver. Completely free.
            </p>
            <Link
              to="/free-trial"
              className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl font-semibold text-xs bg-[var(--primary)] text-white shadow-xs hover:opacity-90 transition-opacity"
            >
              <span>Start 10-Question Trial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
};
