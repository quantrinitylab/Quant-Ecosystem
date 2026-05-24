// ============================================================================
// QuantNeon - ARTryOn Component
// AR try-on: camera feed placeholder, product overlay, product selector,
// capture/share buttons, category switcher, before/after toggle
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface ARProduct {
  id: string;
  name: string;
  thumbnail: string;
  overlayImage: string;
  category: 'glasses' | 'hats' | 'makeup' | 'jewelry';
  price: number;
  productUrl: string;
}

interface ARTryOnProps {
  products: ARProduct[];
  onCapture: (productId: string) => void;
  onShare: (productId: string, imageData: string) => void;
  onBuyProduct: (product: ARProduct) => void;
}

const CATEGORIES: Array<{ key: ARProduct['category']; label: string; icon: string }> = [
  { key: 'glasses', label: 'Glasses', icon: '\u{1F453}' },
  { key: 'hats', label: 'Hats', icon: '\u{1F3A9}' },
  { key: 'makeup', label: 'Makeup', icon: '\u{1F484}' },
  { key: 'jewelry', label: 'Jewelry', icon: '\u{1F48D}' },
];

const ARTryOn: React.FC<ARTryOnProps> = ({ products, onCapture, onShare, onBuyProduct }) => {
  const [selectedProduct, setSelectedProduct] = useState<ARProduct | null>(null);
  const [category, setCategory] = useState<ARProduct['category']>('glasses');
  const [captured, setCaptured] = useState<boolean>(false);
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [capturedImage, setCapturedImage] = useState<string>('');

  const cameraRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredProducts = products.filter((p) => p.category === category);

  useEffect(() => {
    if (filteredProducts.length > 0 && !selectedProduct) {
      setSelectedProduct(filteredProducts[0]);
    }
  }, [category, filteredProducts, selectedProduct]);

  useEffect(() => {
    setCaptured(false);
    setCapturedImage('');
    setShowComparison(false);
  }, [selectedProduct?.id]);

  const handleCategoryChange = useCallback((newCategory: ARProduct['category']) => {
    setCategory(newCategory);
    setSelectedProduct(null);
    setCaptured(false);
    setShowComparison(false);
  }, []);

  const handleSelectProduct = useCallback((product: ARProduct) => {
    setSelectedProduct(product);
  }, []);

  const handleCapture = useCallback(() => {
    if (!selectedProduct) return;
    setCaptured(true);
    setCapturedImage(`captured_${selectedProduct.id}_${Date.now()}`);
    onCapture(selectedProduct.id);
  }, [selectedProduct, onCapture]);

  const handleShare = useCallback(() => {
    if (!selectedProduct || !capturedImage) return;
    onShare(selectedProduct.id, capturedImage);
  }, [selectedProduct, capturedImage, onShare]);

  const handleBuy = useCallback(() => {
    if (!selectedProduct) return;
    onBuyProduct(selectedProduct);
  }, [selectedProduct, onBuyProduct]);

  const toggleComparison = useCallback(() => {
    setShowComparison((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraActive((prev) => !prev);
  }, []);

  const handleRetake = useCallback(() => {
    setCaptured(false);
    setCapturedImage('');
    setShowComparison(false);
  }, []);

  const getOverlayPosition = useCallback((cat: ARProduct['category']): string => {
    switch (cat) {
      case 'glasses':
        return 'top-[35%] left-1/2 -translate-x-1/2 w-32';
      case 'hats':
        return 'top-[10%] left-1/2 -translate-x-1/2 w-36';
      case 'makeup':
        return 'top-[40%] left-1/2 -translate-x-1/2 w-28';
      case 'jewelry':
        return 'top-[55%] left-1/2 -translate-x-1/2 w-20';
      default:
        return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28';
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-black rounded-xl overflow-hidden">
      {/* Camera Feed Area */}
      <div ref={cameraRef} className="relative flex-1 min-h-[400px] bg-gray-900">
        {cameraActive ? (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Camera Feed Placeholder */}
            <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
              <div className="w-48 h-64 border-2 border-dashed border-gray-600 rounded-full flex items-center justify-center">
                <span className="text-gray-500 text-sm text-center px-4">Face detection area</span>
              </div>
            </div>

            {/* Product Overlay */}
            {selectedProduct && !showComparison && (
              <div className={`absolute ${getOverlayPosition(category)} pointer-events-none`}>
                <img
                  src={selectedProduct.overlayImage}
                  alt={selectedProduct.name}
                  className="w-full h-auto opacity-90"
                />
              </div>
            )}

            {/* Captured overlay */}
            {captured && (
              <div className="absolute top-4 right-4 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                Captured!
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <p className="text-gray-400 text-lg mb-2">Camera Off</p>
              <button onClick={toggleCamera} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                Turn On Camera
              </button>
            </div>
          </div>
        )}

        {/* Before/After Toggle */}
        {selectedProduct && cameraActive && (
          <button
            onClick={toggleComparison}
            className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              showComparison ? 'bg-white text-black' : 'bg-black/50 text-white backdrop-blur-sm'
            }`}
          >
            {showComparison ? 'Before' : 'After'}
          </button>
        )}

        {/* Action Buttons (top right) */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button
            onClick={toggleCamera}
            className="w-10 h-10 bg-black/50 backdrop-blur-sm text-white rounded-full flex items-center justify-center text-lg"
          >
            {cameraActive ? '\u{1F4F7}' : '\u{1F6AB}'}
          </button>
        </div>

        {/* Bottom Action Bar */}
        <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 px-4">
          {captured ? (
            <>
              <button onClick={handleRetake} className="px-4 py-2.5 bg-gray-700 text-white rounded-full text-sm font-medium">
                Retake
              </button>
              <button onClick={handleShare} className="px-4 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium">
                Share
              </button>
              <button onClick={handleBuy} className="px-4 py-2.5 bg-green-600 text-white rounded-full text-sm font-medium">
                Buy ${selectedProduct?.price.toFixed(2)}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCapture}
                disabled={!selectedProduct || !cameraActive}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm disabled:opacity-40 hover:bg-white/30 transition-colors"
              />
              <button onClick={handleBuy} disabled={!selectedProduct} className="px-4 py-2.5 bg-green-600 text-white rounded-full text-sm font-medium disabled:opacity-40">
                Buy Now
              </button>
            </>
          )}
        </div>
      </div>

      {/* Category Selector */}
      <div className="bg-gray-900 px-4 py-3 border-t border-gray-800">
        <div className="flex gap-2 justify-center">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                category === cat.key ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Product Selector - Horizontal Scroll */}
      <div className="bg-gray-900 px-4 pb-4 border-t border-gray-800">
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto py-3 scrollbar-hide">
          {filteredProducts.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 w-full text-center">No products in this category</p>
          ) : (
            filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                  selectedProduct?.id === product.id
                    ? 'border-blue-500 scale-105 shadow-lg shadow-blue-500/20'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <img src={product.thumbnail} alt={product.name} className="w-full h-full object-cover" />
              </button>
            ))
          )}
        </div>
        {selectedProduct && (
          <div className="flex items-center justify-between mt-1">
            <p className="text-white text-sm font-medium">{selectedProduct.name}</p>
            <p className="text-green-400 text-sm font-bold">${selectedProduct.price.toFixed(2)}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ARTryOn;
