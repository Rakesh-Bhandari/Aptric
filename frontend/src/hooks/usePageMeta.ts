import { useEffect } from 'react';

export interface PageMetaOptions {
  title: string;
  description: string;
  canonicalPath: string;
  noindex?: boolean;
  structuredData?: object | object[];
}

const CANONICAL_ORIGIN = 'https://aptric.app';

export function usePageMeta({
  title,
  description,
  canonicalPath,
  noindex = false,
  structuredData,
}: PageMetaOptions) {
  useEffect(() => {
    // 1. Update Title
    const formattedTitle = title.includes('Aptric') ? title : `${title} – Aptric`;
    document.title = formattedTitle;

    // 2. Canonical Tag
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const canonicalUrl = `${CANONICAL_ORIGIN}${cleanPath}`;
    let canonicalTag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalTag) {
      canonicalTag = document.createElement('link');
      canonicalTag.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalTag);
    }
    const previousCanonical = canonicalTag.getAttribute('href');
    canonicalTag.setAttribute('href', canonicalUrl);

    // 3. Meta Description
    let descTag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!descTag) {
      descTag = document.createElement('meta');
      descTag.setAttribute('name', 'description');
      document.head.appendChild(descTag);
    }
    const previousDesc = descTag.getAttribute('content');
    descTag.setAttribute('content', description);

    // 4. Robots Tag
    let robotsTag = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!robotsTag) {
      robotsTag = document.createElement('meta');
      robotsTag.setAttribute('name', 'robots');
      document.head.appendChild(robotsTag);
    }
    const previousRobots = robotsTag.getAttribute('content');
    robotsTag.setAttribute('content', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');

    // 5. OpenGraph Tags
    const setMetaProperty = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('property', property);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    setMetaProperty('og:title', formattedTitle);
    setMetaProperty('og:description', description);
    setMetaProperty('og:url', canonicalUrl);

    // 6. Structured Data (JSON-LD)
    let jsonLdScript: HTMLScriptElement | null = null;
    if (structuredData) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.type = 'application/ld+json';
      jsonLdScript.id = 'page-structured-data';
      jsonLdScript.text = JSON.stringify(structuredData);
      document.head.appendChild(jsonLdScript);
    }

    return () => {
      if (previousCanonical && canonicalTag) canonicalTag.setAttribute('href', previousCanonical);
      if (previousDesc && descTag) descTag.setAttribute('content', previousDesc);
      if (previousRobots && robotsTag) robotsTag.setAttribute('content', previousRobots);
      if (jsonLdScript && jsonLdScript.parentNode) {
        jsonLdScript.parentNode.removeChild(jsonLdScript);
      }
    };
  }, [title, description, canonicalPath, noindex, structuredData]);
}
