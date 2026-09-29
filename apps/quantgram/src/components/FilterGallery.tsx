// ============================================================================
// QuantNeon - FilterGallery Component (photo/video filter gallery)
// ============================================================================

interface FilterItem {
  name: string;
  thumbnailUrl: string;
  category: string;
}

interface FilterGalleryProps {
  filters: FilterItem[];
  selectedFilter: string | null;
  previewUrl: string;
  onSelect: (name: string) => void;
}

export function FilterGallery({
  filters,
  selectedFilter,
  previewUrl,
  onSelect,
}: FilterGalleryProps) {
  return (
    <div className="flex flex-col h-full bg-black" aria-label="Filter gallery">
      {/* Preview Area */}
      <div className="relative flex-1 flex items-center justify-center bg-gray-900">
        <img
          src={previewUrl}
          alt="Filter preview"
          className="max-w-full max-h-full object-contain"
        />
        {selectedFilter && (
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full">
            {selectedFilter}
          </span>
        )}
      </div>

      {/* Filter List */}
      <div
        className="flex gap-3 px-4 py-4 overflow-x-auto bg-gray-900 border-t border-gray-800"
        role="listbox"
        aria-label="Available filters"
      >
        {/* Original (no filter) option */}
        <button
          className={`flex flex-col items-center gap-1.5 flex-shrink-0 ${
            !selectedFilter ? 'opacity-100' : 'opacity-60 hover:opacity-80'
          }`}
          onClick={() => onSelect('')}
          role="option"
          aria-selected={!selectedFilter}
          aria-label="Original (no filter)"
        >
          <div
            className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center bg-gray-800 ${
              !selectedFilter ? 'border-blue-500' : 'border-gray-700'
            }`}
          >
            <span className="text-gray-400 text-xs">None</span>
          </div>
          <span className="text-xs text-gray-300 truncate w-16 text-center">Original</span>
        </button>

        {filters.map((f) => (
          <button
            key={f.name}
            className={`flex flex-col items-center gap-1.5 flex-shrink-0 ${
              selectedFilter === f.name ? 'opacity-100' : 'opacity-60 hover:opacity-80'
            }`}
            onClick={() => onSelect(f.name)}
            role="option"
            aria-selected={selectedFilter === f.name}
            aria-label={`Filter: ${f.name}`}
          >
            <div
              className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${
                selectedFilter === f.name ? 'border-blue-500' : 'border-gray-700'
              }`}
            >
              <img src={f.thumbnailUrl} alt={f.name} className="w-full h-full object-cover" />
            </div>
            <span className="text-xs text-gray-300 truncate w-16 text-center">{f.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FilterGallery;
