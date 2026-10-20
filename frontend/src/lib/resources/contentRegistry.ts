import { ALL_SUBTOPICS } from './catalogue';

import { BAR_CHARTS_CONTENT } from './content/barCharts';
import { NUMBER_SYSTEM_CONTENT } from './content/numberSystem';
import { OOP_CONTENT } from './content/oop';
import { PERCENTAGES_CONTENT } from './content/percentages';
import { READING_COMPREHENSION_CONTENT } from './content/readingComprehension';
import { SYLLOGISM_CONTENT } from './content/syllogism';
import type { EducationalTopicContent } from './types';

// Registry of authored article modules; editorial verification remains explicitly pending.
const AUTHORED_CONTENT_MAP: Record<string, EducationalTopicContent> = {
  percentages: PERCENTAGES_CONTENT,
  'number-system': NUMBER_SYSTEM_CONTENT,
  syllogism: SYLLOGISM_CONTENT,
  'reading-comprehension': READING_COMPREHENSION_CONTENT,
  'bar-charts': BAR_CHARTS_CONTENT,
  oop: OOP_CONTENT,
};

/**
 * Retrieves the full educational content for a given subtopic slug.
 * Returns only authored modules. Unwritten topics are not exposed as thin placeholder pages.
 */
export function getEducationalTopicContent(subtopicSlug: string): EducationalTopicContent | undefined {
  const custom = AUTHORED_CONTENT_MAP[subtopicSlug];
  if (!custom) return undefined;

  // Previous/next links only point to articles with actual authored content.
  const availableSlugs = Object.keys(AUTHORED_CONTENT_MAP).sort((left, right) =>
    ALL_SUBTOPICS.findIndex((item) => item.slug === left) - ALL_SUBTOPICS.findIndex((item) => item.slug === right),
  );
  const index = availableSlugs.indexOf(subtopicSlug);
  const makeReference = (slug: string | undefined) => {
    if (!slug) return undefined;
    const item = AUTHORED_CONTENT_MAP[slug];
    return {
      title: item.subtopicName,
      href: `/resources/${item.sectionSlug}/${item.topicSlug}/${item.subtopicSlug}`,
      sectionName: item.sectionName,
    };
  };

  return {
    ...custom,
    prerequisites: custom.prerequisites.map((prerequisite) => {
      if (!prerequisite.href) return prerequisite;
      const slug = prerequisite.href.split('/').filter(Boolean).at(-1);
      return slug && AUTHORED_CONTENT_MAP[slug] ? prerequisite : { title: prerequisite.title };
    }),
    relatedTopics: (() => {
      const related = custom.relatedTopics.filter((item) => {
        const slug = item.href.split('/').filter(Boolean).at(-1);
        return Boolean(slug && AUTHORED_CONTENT_MAP[slug] && slug !== subtopicSlug);
      });
      if (related.length) return related;
      return availableSlugs.filter((slug) => slug !== subtopicSlug).slice(0, 3).map((slug) => {
        const item = AUTHORED_CONTENT_MAP[slug];
        return {
          title: item.subtopicName,
          href: `/resources/${item.sectionSlug}/${item.topicSlug}/${item.subtopicSlug}`,
          relationship: 'parallel' as const,
          description: `Explore the related ${item.subtopicName} learning guide.`,
        };
      });
    })(),
    previousSubtopic: makeReference(availableSlugs[index - 1]),
    nextSubtopic: makeReference(availableSlugs[index + 1]),
  };
}
