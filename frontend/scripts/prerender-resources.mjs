import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const dist = path.join(root, 'dist');
const canonicalOrigin = 'https://aptric.app';
const baseHtml = await readFile(path.join(dist, 'index.html'), 'utf8');
const vite = await createServer({
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  // This server is only used to load local modules for static prerendering.
  // Disable Vite's background dependency discovery so closing this short-lived
  // SSR server cannot race the optimizer's index.html scan after the build.
  optimizeDeps: { noDiscovery: true, entries: [] },
});

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const plainText = (value = '') => String(value)
  .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[\w-]*\n?|```/g, ' '))
  .replace(/^\s{0,3}#{1,6}\s+/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/\*(.*?)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
const paragraphs = (value) => plainText(value).split(/\n\s*\n/).filter(Boolean)
  .map((line) => `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`).join('');
const replaceMeta = (html, title, description, url, noindex = false, jsonLd = null) => {
  const replace = (pattern, value) => { html = html.replace(pattern, value); };
  replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  replace(/<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${escapeHtml(description)}" />`);
  replace(/<meta name="robots" content="[^"]*"\s*\/>/i, `<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}" />`);
  replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${url}" />`);
  replace(/<meta property="og:url" content="[^"]*"\s*\/>/i, `<meta property="og:url" content="${url}" />`);
  replace(/<meta property="og:title" content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  replace(/<meta property="og:description" content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${escapeHtml(description)}" />`);
  replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/i, `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/i, `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  if (jsonLd) html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n  </head>`);
  return html;
};
const css = `<style>
.seo-prerender{max-width:900px;margin:0 auto;padding:2rem 1.25rem;color:#172033;font:16px/1.7 system-ui,sans-serif}
.seo-prerender h1{font-size:2rem;line-height:1.2;margin:0 0 1rem}.seo-prerender h2{font-size:1.45rem;margin:2rem 0 .6rem}.seo-prerender h3{font-size:1.1rem;margin:1.25rem 0 .4rem}
.seo-prerender p{margin:.65rem 0}.seo-prerender li{margin:.35rem 0}.seo-prerender a{color:#1d4ed8;text-decoration:underline}.seo-prerender .eyebrow{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#475569}
</style>`;

try {
  const { getEducationalTopicContent } = await vite.ssrLoadModule('/src/lib/resources/contentRegistry.ts');
  const { getAllSections } = await vite.ssrLoadModule('/src/lib/resources/catalogue.ts');
  const sections = getAllSections();
  const generatedUrls = [];

  const writeRoute = async (route, title, description, body, jsonLd = null, noindex = false) => {
    const canonicalPath = route === '/' ? '/' : `/${route.replace(/^\/+|\/+$/g, '')}`;
    const url = `${canonicalOrigin}${canonicalPath}`;
    const html = replaceMeta(baseHtml, title, description, url, noindex, jsonLd)
      .replace('</head>', `${css}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    const outputPath = path.join(dist, route.replace(/^\/+|\/+$/g, ''), 'index.html');
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html);
    generatedUrls.push(url);
  };

  const hubBody = `<main class="seo-prerender"><p class="eyebrow">Free learning library</p><h1>Free Aptitude Learning Resources</h1><p>Study original aptitude notes, formulas, worked examples, practice checkpoints, and topic guides without creating an account.</p><h2>Browse by subject</h2><ul>${sections.map((section) => `<li><a href="/resources/${escapeHtml(section.slug)}">${escapeHtml(section.name)}</a> — ${escapeHtml(section.description)}<ul>${section.topics.flatMap((topic) => topic.subtopics).map((item) => `<li><a href="/resources/${escapeHtml(item.sectionSlug)}/${escapeHtml(item.topicSlug)}/${escapeHtml(item.slug)}">${escapeHtml(item.name)}</a></li>`).join('')}</ul></li>`).join('')}</ul><p><a href="/free-trial">Try 10 questions free</a> or <a href="/terms">read Aptric's terms</a>.</p></main>`;
  await writeRoute('resources', 'Free Aptitude Learning Resources – Aptric', 'Free aptitude notes, formulas, worked examples, practice checkpoints, and topic guides for placement preparation.', hubBody, {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Free Aptitude Learning Resources', description: 'Free original aptitude learning notes and worked examples.', url: `${canonicalOrigin}/resources`,
  });

  for (const section of sections) {
    const route = `resources/${section.slug}`;
    const links = section.topics.flatMap((topic) => topic.subtopics).map((item) => `<li><a href="/resources/${escapeHtml(item.sectionSlug)}/${escapeHtml(item.topicSlug)}/${escapeHtml(item.slug)}">${escapeHtml(item.name)}</a> — ${escapeHtml(item.description)}</li>`).join('');
    const body = `<main class="seo-prerender"><p class="eyebrow"><a href="/resources">Resources</a></p><h1>${escapeHtml(section.name)} Study Notes</h1><p>${escapeHtml(section.description)}</p><h2>Available topic guides</h2><ul>${links}</ul><p><a href="/free-trial">Try 10 questions free</a></p></main>`;
    await writeRoute(route, `${section.name} Study Notes – Aptric`, `Free study notes and worked examples for ${section.name}. Explore available topic guides and practice questions.`, body, {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${section.name} Study Notes`, description: section.description, url: `${canonicalOrigin}/${route}`,
    });

    for (const topic of section.topics) {
      for (const item of topic.subtopics) {
        const content = getEducationalTopicContent(item.slug);
        if (!content) continue;
        const articlePath = `resources/${content.sectionSlug}/${content.topicSlug}/${content.subtopicSlug}`;
        const sectionName = escapeHtml(content.sectionName);
        const relatedLinks = content.relatedTopics.map((related) => `<li><a href="${escapeHtml(related.href)}">${escapeHtml(related.title)}</a> — ${escapeHtml(related.description)}</li>`).join('');
        const concepts = content.coreConcepts.map((concept) => `<section><h3>${escapeHtml(concept.heading)}</h3>${paragraphs(concept.body)}</section>`).join('');
        const definitions = content.definitionsAndNotation.map((item) => `<li><strong>${escapeHtml(plainText(item.term))}:</strong> ${escapeHtml(plainText(item.definition))}</li>`).join('');
        const formulas = content.formulas.map((item) => `<li><strong>${escapeHtml(item.name)}:</strong> <code>${escapeHtml(item.formula)}</code><p>${escapeHtml(item.explanation)}</p>${item.assumptions ? `<p>Assumptions: ${escapeHtml(item.assumptions)}</p>` : ''}</li>`).join('');
        const examples = content.workedExamples.map((item) => `<section><h3>${escapeHtml(item.title)} (${escapeHtml(item.difficulty)})</h3><p><strong>Question:</strong> ${escapeHtml(plainText(item.question))}</p><p><strong>Solution:</strong> ${escapeHtml(plainText(item.solution))}</p><p><strong>Verification:</strong> ${escapeHtml(plainText(item.verification))}</p><p><strong>Answer:</strong> ${escapeHtml(plainText(item.answer))}</p></section>`).join('');
        const practice = content.practiceQuestions.map((item, index) => `<li><p><strong>Question ${index + 1}:</strong> ${escapeHtml(plainText(item.stem))}</p><ol type="A">${item.options.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ol><p><strong>Answer:</strong> ${escapeHtml(item.options[item.correctIndex])}. ${escapeHtml(plainText(item.explanation))}</p></li>`).join('');
        const faqs = content.faqs.map((item) => `<section><h3>${escapeHtml(item.question)}</h3>${paragraphs(item.answer)}</section>`).join('');
        const body = `<main class="seo-prerender"><p class="eyebrow"><a href="/resources">Resources</a> / <a href="/resources/${escapeHtml(content.sectionSlug)}">${sectionName}</a> / ${escapeHtml(content.topicName)}</p><h1>${escapeHtml(content.title)}</h1><p><strong>Learning objective:</strong> ${escapeHtml(content.learningObjective)}</p><section><h2>Introduction</h2>${paragraphs(content.introduction)}</section>${content.prerequisites.length ? `<section><h2>Prerequisites</h2><ul>${content.prerequisites.map((p) => `<li>${p.href ? `<a href="${escapeHtml(p.href)}">${escapeHtml(p.title)}</a>` : escapeHtml(p.title)}</li>`).join('')}</ul></section>` : ''}<section><h2>Core concepts</h2>${concepts}</section><section><h2>Definitions and notation</h2><ul>${definitions}</ul></section><section><h2>Formulas and reference</h2><ul>${formulas}</ul></section><section><h2>Worked examples</h2>${examples}</section><section><h2>Tips and common mistakes</h2><ul>${content.tipsAndTricks.map((tip) => `<li>${escapeHtml(plainText(tip))}</li>`).join('')}${content.commonMistakes.map((mistake) => `<li><strong>${escapeHtml(mistake.mistake)}</strong> ${escapeHtml(mistake.howToAvoid)}</li>`).join('')}</ul></section><section><h2>Practice checkpoint</h2><ol>${practice}</ol></section><section><h2>Quick revision</h2><ul>${content.revisionSummary.map((item) => `<li>${escapeHtml(plainText(item))}</li>`).join('')}</ul></section><section><h2>Frequently asked questions</h2>${faqs}</section><section><h2>Related topics</h2><ul>${relatedLinks}</ul></section><p><a href="/free-trial">Try 10 questions free</a> · <a href="/resources">All resources</a></p><p>Editorial review pending; report suspected errors using the feedback form in the interactive article.</p></main>`;
        const description = `${plainText(content.introduction).slice(0, 150)} Study guide with formulas, worked examples, and practice questions.`;
        const jsonLd = {
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'LearningResource', name: content.title, description, learningResourceType: 'Study Guide', educationalLevel: 'Placement preparation', url: `${canonicalOrigin}/${articlePath}`, isAccessibleForFree: true, publisher: { '@type': 'Organization', name: 'Aptric', url: `${canonicalOrigin}/` } },
            { '@type': 'BreadcrumbList', itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Resources', item: `${canonicalOrigin}/resources` },
              { '@type': 'ListItem', position: 2, name: content.sectionName, item: `${canonicalOrigin}/resources/${content.sectionSlug}` },
              { '@type': 'ListItem', position: 3, name: content.subtopicName, item: `${canonicalOrigin}/${articlePath}` },
            ] },
          ],
        };
        await writeRoute(articlePath, `${content.title} – Aptric Resources`, description, body, jsonLd, true);
      }
    }
  }

  const trustPages = [
    ['about', 'About Aptric', 'Aptric offers aptitude practice, daily challenges, progress features, and free public learning resources.', '<h2>What Aptric offers</h2><p>Aptric combines practice sessions, daily challenges, progress features, and public learning resources. The resource library is designed to explain concepts with definitions, worked examples, formulas, and practice checkpoints without requiring an account to read.</p><p><a href="/resources">Browse free resources</a> or <a href="/free-trial">try the 10-question trial</a>.</p>'],
    ['privacy', 'Privacy Policy – Aptric', 'How Aptric handles account information, learning activity, browser storage, public resource feedback, and privacy requests.', '<h2>Information we process</h2><p>Account use may involve profile information and learning activity such as answers, scores, streaks, and progress. Public resource feedback includes the topic, category, and message submitted. Do not include passwords or sensitive information in feedback.</p><h2>Purpose and storage</h2><p>Information is used to provide account access, operate learning features, protect the service against abuse, respond to support requests, and maintain the platform. Browser storage may remember interface preferences and support a temporary anonymous trial session.</p><h2>Advertising</h2><p>The current frontend source does not include third-party advertising code. If advertising or analytics providers are introduced, this policy must be updated to describe their data use, cookies or similar technologies, and any required consent or opt-out choices before those features are enabled.</p><p>Contact <a href="mailto:aptricofficials@gmail.com">aptricofficials@gmail.com</a> for privacy requests.</p>'],
    ['contact', 'Contact Aptric', 'Contact Aptric about account support, public learning resources, accessibility, or corrections to educational content.', '<h2>Email</h2><p><a href="mailto:aptricofficials@gmail.com">aptricofficials@gmail.com</a></p><p>For educational-content corrections, include the article title and describe the exact formula, step, or explanation that may be incorrect. Do not include passwords or other sensitive information.</p>'],
    ['terms', 'Terms & Conditions – Aptric', 'Terms for using Aptric, including account responsibilities, acceptable use, learning content, and contact information.', '<h2>Using Aptric</h2><p>By using Aptric, you agree to use the platform lawfully, protect your account credentials, and not attempt unauthorized access or abuse. Learning content and scores are provided without a guarantee of uninterrupted or error-free service.</p><h2>Privacy and contact</h2><p>See the <a href="/privacy">Privacy Policy</a> for information practices. Questions can be sent to <a href="mailto:aptricofficials@gmail.com">aptricofficials@gmail.com</a>. The full Terms page is available in the application.</p>'],
  ];
  for (const [route, title, description, body] of trustPages) {
    await writeRoute(route, title, description, `<main class="seo-prerender"><h1>${escapeHtml(title)}</h1>${body}</main>`);
  }

  const trialIntroBody = '<main class="seo-prerender"><p class="eyebrow">Free solver trial</p><h1>Try the Aptric Solver in 10 Questions</h1><p>Solve ten original placement-style aptitude practice questions across quantitative aptitude, logical reasoning, verbal ability, data interpretation, and technical fundamentals. No account is required to start.</p><p>The trial provides server-graded answers and stored explanations. It does not include the authenticated AI tutor.</p><p><a href="/free-trial/solve">Start the trial</a> · <a href="/resources">Study free resources first</a></p></main>';
  await writeRoute('free-trial', 'Free 10-Question Aptitude Trial – Aptric', 'Try ten aptitude questions for free with server-graded answers and stored explanations.', trialIntroBody, {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Aptric 10-Question Free Solver Trial', url: `${canonicalOrigin}/free-trial`, applicationCategory: 'EducationalApplication', isAccessibleForFree: true,
  });

  // Trial solve state is transient and must not be indexed, including on direct URL loads.
  const trialSolveBody = '<main class="seo-prerender"><h1>Free Aptric Solver Trial</h1><p>Loading your private 10-question trial session. If this does not load, return to <a href="/free-trial">the trial introduction</a>.</p></main>';
  await writeRoute('free-trial/solve', 'Free Solver Trial Session – Aptric', 'Transient anonymous solver session.', trialSolveBody, null, true);
  console.log(`Generated ${generatedUrls.length} route shells; article routes are noindexed until editorial review is complete.`);
} finally {
  await vite.close();
}
