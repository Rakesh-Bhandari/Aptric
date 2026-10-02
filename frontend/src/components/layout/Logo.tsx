import { AptricLogo, type AptricLogoProps } from '@/components/brand/AptricLogo';

/** App-wide logo: the brand AptricLogo. Kept for existing imports. */
export const Logo = ({ withText = true, ...props }: { withText?: boolean } & Omit<AptricLogoProps, 'markOnly'>) => (
  <AptricLogo markOnly={!withText} {...props} />
);
