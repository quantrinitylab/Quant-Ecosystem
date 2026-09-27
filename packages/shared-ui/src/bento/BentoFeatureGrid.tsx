import React from 'react';

export interface BentoItem {
  id: string;
  title: string;
  description: string;
  span?: '1x1' | '2x1' | '1x2' | '2x2';
  badge?: string;
  icon?: React.ReactNode;
  preview?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export interface BentoFeatureGridProps {
  items: BentoItem[];
  className?: string;
}

export const BentoFeatureGrid: React.FC<BentoFeatureGridProps> = ({ items, className = '' }) => {
  const getSpanClasses = (span: BentoItem['span'] = '1x1') => {
    switch (span) {
      case '2x1':
        return 'col-span-1 md:col-span-2 row-span-1';
      case '1x2':
        return 'col-span-1 row-span-2';
      case '2x2':
        return 'col-span-1 md:col-span-2 row-span-2';
      case '1x1':
      default:
        return 'col-span-1 row-span-1';
    }
  };

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-3 auto-rows-[minmax(180px,auto)] gap-4 bg-[#0D1117] p-6 rounded-2xl text-white ${className}`}
      data-testid="bento-feature-grid"
    >
      {items.map((item) => (
        <div
          key={item.id}
          onClick={item.onClick}
          className={`group relative flex flex-col justify-between rounded-xl bg-[#161B22] p-6 border border-white/10 transition-all duration-300 hover:border-[#58A6FF]/40 hover:shadow-[0_0_30px_rgba(88,166,255,0.15)] ${getSpanClasses(
            item.span,
          )} ${item.onClick ? 'cursor-pointer' : ''} ${item.className || ''}`}
          data-testid={`bento-item-${item.id}`}
        >
          {/* Subtle glowing gradient backdrop on hover */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#58A6FF]/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

          <div className="relative z-10 flex items-start justify-between gap-4 mb-4">
            {item.icon && (
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-[#58A6FF] group-hover:scale-110 transition-transform">
                {item.icon}
              </div>
            )}
            {item.badge && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-[#58A6FF]/10 text-[#58A6FF] border border-[#58A6FF]/20">
                {item.badge}
              </span>
            )}
          </div>

          <div className="relative z-10 space-y-2 mb-4">
            <h3 className="text-lg font-semibold tracking-tight text-white group-hover:text-[#58A6FF] transition-colors">
              {item.title}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">{item.description}</p>
          </div>

          {item.preview && (
            <div className="relative z-10 mt-auto pt-4 border-t border-white/5 overflow-hidden rounded-lg">
              {item.preview}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
