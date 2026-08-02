import { useState, useEffect } from 'react';

/**
 * Tracks actual viewport width rather than relying on a CSS breakpoint, so a
 * component can render an entirely different layout (e.g. cards instead of a
 * table) with only one version ever present in the DOM at a time.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
