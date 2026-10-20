export type SectionSlug =
  | 'quantitative-aptitude'
  | 'logical-reasoning'
  | 'verbal-ability'
  | 'data-interpretation'
  | 'technical-aptitude';

export interface SubtopicMeta {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  topicSlug: string;
  sectionSlug: SectionSlug;
  targetWords?: string;
  hasAuthoredContent?: boolean;
}

export interface TopicMeta {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  sectionSlug: SectionSlug;
  subtopics: SubtopicMeta[];
}

export interface SectionMeta {
  id: string;
  slug: SectionSlug;
  name: string;
  description: string;
  sortOrder: number;
  iconName: string;
  topics: TopicMeta[];
}

export interface WorkedExample {
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  examContext?: string;
  question: string;
  solution: string;
  verification: string;
  answer: string;
}

export interface PracticeQuestion {
  id: string;
  stem: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FormulaItem {
  name: string;
  formula: string;
  explanation: string;
  assumptions?: string;
}

export interface CoreConceptItem {
  heading: string;
  body: string;
}

export interface DefinitionItem {
  term: string;
  definition: string;
}

export interface AlternativeMethod {
  name: string;
  description: string;
  whenValid: string;
  whenItFails: string;
}

export interface CommonMistake {
  mistake: string;
  whyItHappens: string;
  howToAvoid: string;
}

export interface DifficultyGuideItem {
  level: 'Foundational (Easy)' | 'Standard (Medium)' | 'Advanced (Hard)';
  characteristics: string;
  typicalExam: string;
}

export interface RelatedTopicRef {
  title: string;
  href: string;
  relationship: 'prerequisite' | 'next-step' | 'parallel';
  description: string;
}

export interface NavReference {
  title: string;
  href: string;
  sectionName: string;
}

export interface EducationalTopicContent {
  documentId: string;
  sectionSlug: SectionSlug;
  sectionName: string;
  topicSlug: string;
  topicName: string;
  subtopicSlug: string;
  subtopicName: string;
  title: string;
  learningObjective: string;
  introduction: string;
  prerequisites: { title: string; href?: string }[];
  coreConcepts: CoreConceptItem[];
  definitionsAndNotation: DefinitionItem[];
  formulas: FormulaItem[];
  workedExamples: WorkedExample[];
  alternativeMethods: AlternativeMethod[];
  tipsAndTricks: string[];
  commonMistakes: CommonMistake[];
  difficultyProgression: DifficultyGuideItem[];
  practiceQuestions: PracticeQuestion[];
  revisionSummary: string[];
  faqs: FAQItem[];
  relatedTopics: RelatedTopicRef[];
  previousSubtopic?: NavReference;
  nextSubtopic?: NavReference;
  lastUpdated?: string;
  editorialReview?: string;
}
