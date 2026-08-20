'use client';

export type QuantMailLogoProps = {
  /** Rendered square size in px. */
  size?: number;
  /** Extra class names */
  className?: string;
  /** Title / accessible label */
  title?: string;
};

/**
 * QuantMail brand mark — Official 3D Molten Glass & Liquid Metal 'M' Icon.
 */
export function QuantMailLogo({
  size = 40,
  className = '',
  title = 'QuantMail',
}: QuantMailLogoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 drop-shadow-[0_4px_14px_rgba(255,106,0,0.4)] ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
      title={title}
    >
      <img
        src="/quantmail-logo.png"
        alt={title}
        width={size}
        height={size}
        className="w-full h-full object-contain rounded-[22%] transition-transform hover:scale-105"
      />
    </span>
  );
}

export default QuantMailLogo;
