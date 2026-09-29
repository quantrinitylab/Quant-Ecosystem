// ============================================================================
// QuantNeon - ShoppingTag Component
// Product tag overlay for images: tap to show/hide product popup with name,
// price, discount badge, "View" and "Add to Cart" buttons
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ProductTag {
  id: string;
  position: { x: number; y: number };
  productName: string;
  price: number;
  discountPercent?: number;
  productImage: string;
  productUrl: string;
}

interface ShoppingTagProps {
  tags: ProductTag[];
  onAddToCart: (tag: ProductTag) => void;
  onViewProduct: (tag: ProductTag) => void;
}

const ShoppingTag: React.FC<ShoppingTagProps> = ({ tags, onAddToCart, onViewProduct }) => {
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [animating, setAnimating] = useState<boolean>(false);

  const popupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        handleClosePopup();
      }
    };
    if (activeTagId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeTagId]);

  const handleTagClick = useCallback(
    (tagId: string) => {
      if (activeTagId === tagId) {
        handleClosePopup();
        return;
      }
      setAnimating(true);
      setActiveTagId(tagId);
      setTimeout(() => setAnimating(false), 300);
    },
    [activeTagId]
  );

  const handleClosePopup = useCallback(() => {
    setAnimating(true);
    setTimeout(() => {
      setActiveTagId(null);
      setAnimating(false);
    }, 200);
  }, []);

  const handleAddToCart = useCallback(
    (tag: ProductTag) => {
      onAddToCart(tag);
      handleClosePopup();
    },
    [onAddToCart, handleClosePopup]
  );

  const handleViewProduct = useCallback(
    (tag: ProductTag) => {
      onViewProduct(tag);
    },
    [onViewProduct]
  );

  const calculateDiscountedPrice = useCallback((price: number, discount?: number): string => {
    if (!discount) return price.toFixed(2);
    const discounted = price - (price * discount) / 100;
    return discounted.toFixed(2);
  }, []);

  const getPopupPosition = useCallback((tag: ProductTag): { top: boolean; left: boolean } => {
    return {
      top: tag.position.y > 60,
      left: tag.position.x > 60,
    };
  }, []);

  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {tags.map((tag) => {
        const isActive = activeTagId === tag.id;
        const popupPos = getPopupPosition(tag);

        return (
          <div
            key={tag.id}
            className="absolute pointer-events-auto"
            style={{
              left: `${tag.position.x}%`,
              top: `${tag.position.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Tag Dot */}
            <button
              onClick={() => handleTagClick(tag.id)}
              className={`w-6 h-6 rounded-full bg-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 ${
                isActive ? 'ring-2 ring-blue-500 scale-110' : 'ring-1 ring-gray-300'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            </button>

            {/* Product Popup */}
            {isActive && (
              <div
                ref={popupRef}
                className={`absolute z-50 w-64 bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-200 ${
                  animating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                } ${popupPos.top ? 'bottom-full mb-3' : 'top-full mt-3'} ${
                  popupPos.left ? 'right-0' : 'left-0'
                }`}
              >
                {/* Product Image */}
                <div className="relative h-32 bg-gray-100">
                  <img
                    src={tag.productImage}
                    alt={tag.productName}
                    className="w-full h-full object-cover"
                  />
                  {tag.discountPercent && tag.discountPercent > 0 && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      -{tag.discountPercent}%
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="p-3">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">{tag.productName}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-base font-bold text-gray-900">
                      ${calculateDiscountedPrice(tag.price, tag.discountPercent)}
                    </span>
                    {tag.discountPercent && tag.discountPercent > 0 && (
                      <span className="text-xs text-gray-400 line-through">${tag.price.toFixed(2)}</span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleViewProduct(tag)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleAddToCart(tag)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Tag Count Indicator */}
      <div className="absolute bottom-3 left-3 pointer-events-auto">
        <button
          onClick={() => setActiveTagId(null)}
          className="bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1"
        >
          <span className="w-1.5 h-1.5 bg-white rounded-full" />
          <span>{tags.length} {tags.length === 1 ? 'product' : 'products'}</span>
        </button>
      </div>
    </div>
  );
};

export default ShoppingTag;
