import { useMemo } from 'react';
import { generateBrandCSS, generateAppCSS } from '@quant/brand';

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const cssContent = useMemo(() => {
    const brandCSS = generateBrandCSS();
    const appCSS = generateAppCSS('quantedits');
    return `${brandCSS}\n${appCSS}`;
  }, []);

  return (
    <>
      {/* TRUST BOUNDARY: generateBrandCSS and generateAppCSS produce trusted, static CSS
         from the internal @quant/brand package. They do not accept user input. If the brand
         package is ever extended to accept runtime or user-supplied values, this injection
         point must be revisited and the output sanitized. */}
      <style dangerouslySetInnerHTML={{ __html: cssContent }} />
      {children}
    </>
  );
}
