import { describe, expect, it } from 'vitest';
import { getAllSections } from './catalogue';
import { getEducationalTopicContent } from './contentRegistry';

const publishedSlugs = [
  'number-system',
  'percentages',
  'syllogism',
  'reading-comprehension',
  'bar-charts',
  'oop',
];

describe('public resource content registry', () => {
  it('does not manufacture article content for unwritten taxonomy topics', () => {
    expect(getEducationalTopicContent('profit-and-loss')).toBeUndefined();
    expect(getEducationalTopicContent('not-a-real-topic')).toBeUndefined();
  });

  it('publishes only authored topics in section navigation and search surfaces', () => {
    const visible = getAllSections().flatMap((section) => section.topics.flatMap((topic) => topic.subtopics.map((item) => item.slug)));
    expect([...visible].sort()).toEqual([...publishedSlugs].sort());
  });

  it('provides a complete editorial structure for every available article', () => {
    for (const slug of publishedSlugs) {
      const content = getEducationalTopicContent(slug);
      expect(content, slug).toBeDefined();
      expect(content!.title.length, slug).toBeGreaterThan(12);
      expect(content!.learningObjective.length, slug).toBeGreaterThan(20);
      expect(content!.coreConcepts.length, slug).toBeGreaterThanOrEqual(3);
      expect(content!.workedExamples.length, slug).toBeGreaterThanOrEqual(3);
      expect(content!.practiceQuestions.length, slug).toBe(5);
      expect(content!.faqs.length, slug).toBeGreaterThanOrEqual(3);
      expect(content!.commonMistakes.length, slug).toBeGreaterThanOrEqual(2);
      expect(content!.revisionSummary.length, slug).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps previous, next, and related links within the published article set', () => {
    const published = new Set(publishedSlugs);
    for (const slug of publishedSlugs) {
      const content = getEducationalTopicContent(slug)!;
      const refs = [content.previousSubtopic, content.nextSubtopic, ...content.relatedTopics].filter(Boolean);
      for (const reference of refs) {
        const targetSlug = reference!.href.split('/').filter(Boolean).at(-1);
        expect(published.has(targetSlug!), `${slug} links to ${targetSlug}`).toBe(true);
      }
    }
  });
});
