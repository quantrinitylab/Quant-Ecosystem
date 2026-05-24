// ============================================================================
// QuantEdits - Assets Page
// Asset library browser with categories and upload
// ============================================================================

import type { Asset, AssetCategory } from '../types';

interface AssetsPageProps {
  assets: Asset[];
  userAssets: Asset[];
  selectedCategory: AssetCategory | null;
  searchQuery: string;
  onSelectCategory: (category: AssetCategory | null) => void;
  onSearch: (query: string) => void;
  onUseAsset: (assetId: string) => void;
  onUpload: (file: { name: string; category: AssetCategory; size: number; format: string }) => void;
}

export function AssetsPage({ assets, userAssets, selectedCategory, searchQuery, onSelectCategory, onSearch, onUseAsset, onUpload }: AssetsPageProps) {
  const allAssets = [...assets, ...userAssets];
  const filtered = selectedCategory ? allAssets.filter(a => a.category === selectedCategory) : allAssets;

  return {
    type: 'div',
    className: 'assets-page',
    children: [
      { type: 'header', children: [
        { type: 'h1', text: 'Asset Library' },
        { type: 'input', inputType: 'search', placeholder: 'Search assets...', value: searchQuery, onChange: onSearch },
        { type: 'button', text: 'Upload', className: 'btn-primary' },
      ]},
      { type: 'nav', className: 'category-tabs', children: [
        { type: 'button', text: 'All', className: !selectedCategory ? 'active' : '', onClick: () => onSelectCategory(null) },
        { type: 'button', text: 'Fonts', onClick: () => onSelectCategory('font') },
        { type: 'button', text: 'Music', onClick: () => onSelectCategory('music') },
        { type: 'button', text: 'Photos', onClick: () => onSelectCategory('stock-photo') },
        { type: 'button', text: 'Videos', onClick: () => onSelectCategory('stock-video') },
        { type: 'button', text: 'Icons', onClick: () => onSelectCategory('icon') },
        { type: 'button', text: 'Shapes', onClick: () => onSelectCategory('shape') },
        { type: 'button', text: 'Backgrounds', onClick: () => onSelectCategory('background') },
        { type: 'button', text: 'Stickers', onClick: () => onSelectCategory('sticker') },
      ]},
      { type: 'div', className: 'assets-grid', children: filtered.map(asset => ({
        type: 'div',
        className: 'asset-card',
        children: [
          { type: 'div', className: 'asset-thumb', style: { backgroundImage: `url(${asset.thumbnail})` }, children: [
            asset.isPremium ? { type: 'span', className: 'premium', text: 'PRO' } : null,
          ]},
          { type: 'span', text: asset.name },
          { type: 'button', text: 'Use', onClick: () => onUseAsset(asset.id), className: 'btn-sm' },
        ],
      }))},
    ],
  };
}

export default AssetsPage;
