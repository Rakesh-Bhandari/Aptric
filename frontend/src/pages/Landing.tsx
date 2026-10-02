import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useHeaderOverlay } from '@/components/layout/headerOverlay';
import { useReveal } from '@/hooks/useReveal';
import { Hero } from './landing/Hero';
import { ProductPreview } from './landing/ProductPreview';
import { Features, FinalCta, HowItWorks, SectionsShowcase, StatStrip } from './landing/Sections';
import { scrollToSection } from './landing/shared';

/** "/" for signed-out visitors: the marketing page. The header sits transparently over the navy hero. */
const Landing = () => {
  const root = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  useHeaderOverlay();
  useReveal(root);

  // Footer links such as /#features arrive with a hash; jump to that section once.
  useEffect(() => {
    if (hash) scrollToSection(decodeURIComponent(hash.slice(1)), false);
  }, [hash]);

  return (
    <div ref={root} className="-mt-16 overflow-x-clip">
      <Hero />
      <StatStrip />
      <Features />
      <HowItWorks />
      <SectionsShowcase />
      <ProductPreview />
      <FinalCta />
    </div>
  );
};

export default Landing;
