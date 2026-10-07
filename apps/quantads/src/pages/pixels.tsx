// ============================================================================
// QuantAds - Pixels & Tracking Page
// Install code snippet, event list, test events, conversion attribution
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface Pixel {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  domain: string;
  createdAt: string;
  lastActivity: string;
  eventsToday: number;
  totalEvents: number;
}

interface PixelEvent {
  id: string;
  pixelId: string;
  type:
    | 'PageView'
    | 'AddToCart'
    | 'Purchase'
    | 'Lead'
    | 'ViewContent'
    | 'InitiateCheckout'
    | 'CompleteRegistration'
    | 'Search'
    | 'AddPaymentInfo'
    | 'Subscribe';
  url: string;
  value?: number;
  currency?: string;
  timestamp: string;
  userAgent: string;
  ip: string;
  parameters: Record<string, string>;
  attributed: boolean;
  campaignId?: string;
}

interface AttributionModel {
  type: 'last_click' | 'first_click' | 'linear' | 'time_decay' | 'position_based';
  window: number;
  conversions: number;
  revenue: number;
}

interface TestEvent {
  name: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  details?: string;
}

interface PixelsPageProps {
  accountId?: string;
}

const EVENT_TYPES = [
  'PageView',
  'AddToCart',
  'Purchase',
  'Lead',
  'ViewContent',
  'InitiateCheckout',
  'CompleteRegistration',
  'Search',
  'AddPaymentInfo',
  'Subscribe',
] as const;

const PixelsPage: React.FC<PixelsPageProps> = ({ accountId: _accountId }) => {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null);
  const [events, setEvents] = useState<PixelEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'events' | 'install' | 'test' | 'attribution'
  >('overview');
  const [testEvents, setTestEvents] = useState<TestEvent[]>([]);
  const [testing, setTesting] = useState<boolean>(false);
  const [attributionModels, setAttributionModels] = useState<AttributionModel[]>([]);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [showCreatePixel, setShowCreatePixel] = useState<boolean>(false);
  const [newPixelName, setNewPixelName] = useState<string>('');
  const [newPixelDomain, setNewPixelDomain] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const fetchPixels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/pixels');
      if (!response.ok) throw new Error('Failed to load pixels');
      const data = await response.json();
      setPixels(data.pixels || []);
      if (data.pixels?.length > 0 && !selectedPixel) {
        setSelectedPixel(data.pixels[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pixels');
    } finally {
      setLoading(false);
    }
  }, [selectedPixel]);

  const fetchEvents = useCallback(
    async (pixelId: string) => {
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (eventFilter !== 'all') params.set('type', eventFilter);
        const response = await fetch(`/api/pixels/${pixelId}/events?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to load events');
        const data = await response.json();
        setEvents(data.events || []);
      } catch {}
    },
    [eventFilter],
  );

  const fetchAttribution = useCallback(async (pixelId: string) => {
    try {
      const response = await fetch(`/api/pixels/${pixelId}/attribution`);
      if (!response.ok) return;
      const data = await response.json();
      setAttributionModels(data.models || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPixels();
  }, [fetchPixels]);

  useEffect(() => {
    if (selectedPixel) {
      fetchEvents(selectedPixel.id);
      fetchAttribution(selectedPixel.id);
    }
  }, [selectedPixel, eventFilter, fetchEvents, fetchAttribution]);

  const createPixel = useCallback(async () => {
    if (!newPixelName.trim() || !newPixelDomain.trim()) return;
    try {
      const response = await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPixelName, domain: newPixelDomain }),
      });
      if (!response.ok) throw new Error('Failed to create pixel');
      const pixel = await response.json();
      setPixels((prev) => [...prev, pixel]);
      setSelectedPixel(pixel);
      setShowCreatePixel(false);
      setNewPixelName('');
      setNewPixelDomain('');
    } catch (err: any) {
      setError(err.message);
    }
  }, [newPixelName, newPixelDomain]);

  const runTestEvents = useCallback(async () => {
    if (!selectedPixel) return;
    setTesting(true);
    setTestEvents([]);
    for (const eventType of EVENT_TYPES.slice(0, 5)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const response = await fetch(`/api/pixels/${selectedPixel.id}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType }),
        });
        setTestEvents((prev) => [
          ...prev,
          {
            name: eventType,
            status: response.ok ? 'success' : 'failed',
            timestamp: new Date().toISOString(),
            details: response.ok ? 'Event received successfully' : 'Event delivery failed',
          },
        ]);
      } catch {
        setTestEvents((prev) => [
          ...prev,
          {
            name: eventType,
            status: 'failed',
            timestamp: new Date().toISOString(),
            details: 'Network error',
          },
        ]);
      }
    }
    setTesting(false);
  }, [selectedPixel]);

  const getInstallCode = (): string => {
    if (!selectedPixel) return '';
    return `<!-- QuantAds Pixel Code -->
<script>
  !function(q,a,d,s){q.qads=q.qads||function(){
    (q.qads.q=q.qads.q||[]).push(arguments)};
    q.qads.l=1*new Date();var e=a.createElement(d),
    t=a.getElementsByTagName(d)[0];e.async=1;
    e.src=s;t.parentNode.insertBefore(e,t)
  }(window,document,'script','https://ads.quant.app/pixel.js');
  qads('init', '${selectedPixel.id}');
  qads('track', 'PageView');
</script>
<!-- End QuantAds Pixel Code -->`;
  };

  const copyToClipboard = useCallback(() => {
    navigator.clipboard?.writeText(getInstallCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedPixel]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'inactive':
        return 'bg-gray-100 text-gray-600';
      case 'error':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  if (loading && pixels.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
        <span className="ml-3 text-gray-500">Loading pixels...</span>
      </div>
    );
  }

  if (error && pixels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Failed to load pixels</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchPixels} className="px-6 py-2 bg-indigo-500 text-white rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      className="max-w-7xl mx-auto p-6 min-h-screen"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[var(--quant-foreground)]">Pixels & Tracking</h1>
        <button
          onClick={() => setShowCreatePixel(true)}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
        >
          + New Pixel
        </button>
      </header>

      {showCreatePixel && (
        <div className="bg-white rounded-xl shadow-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Create Pixel</h2>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              value={newPixelName}
              onChange={(e) => setNewPixelName(e.target.value)}
              placeholder="Pixel name..."
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              value={newPixelDomain}
              onChange={(e) => setNewPixelDomain(e.target.value)}
              placeholder="Domain (e.g., example.com)"
              className="px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={createPixel} className="px-4 py-2 bg-indigo-500 text-white rounded-lg">
              Create
            </button>
            <button onClick={() => setShowCreatePixel(false)} className="px-4 py-2 text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {pixels.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {pixels.map((pixel) => (
            <button
              key={pixel.id}
              onClick={() => setSelectedPixel(pixel)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg border ${selectedPixel?.id === pixel.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className="font-medium text-sm">{pixel.name}</div>
              <div className="text-xs text-gray-500">{pixel.eventsToday} events today</div>
            </button>
          ))}
        </div>
      )}

      {selectedPixel && (
        <>
          <div className="flex gap-2 mb-6 border-b">
            {(['overview', 'events', 'install', 'test', 'attribution'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize border-b-2 ${activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-xs text-gray-500">Status</p>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs mt-1 inline-block ${getStatusColor(selectedPixel.status)}`}
                >
                  {selectedPixel.status}
                </span>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-xs text-gray-500">Events Today</p>
                <p className="text-2xl font-bold">{selectedPixel.eventsToday.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-xs text-gray-500">Total Events</p>
                <p className="text-2xl font-bold">{selectedPixel.totalEvents.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4">
                <p className="text-xs text-gray-500">Last Activity</p>
                <p className="text-sm font-medium">
                  {new Date(selectedPixel.lastActivity).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div>
              <div className="flex gap-2 mb-4">
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">All Events</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {events.length === 0 ? (
                <div className="text-center py-12 text-gray-500">No events recorded yet</div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                          Event
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                          URL
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                          Value
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                          Attribution
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {events.map((event) => (
                        <tr key={event.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium">{event.type}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">
                            {event.url}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {event.value ? `$${event.value}` : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {event.attributed ? (
                              <span className="text-green-600 text-xs">Attributed</span>
                            ) : (
                              <span className="text-gray-400 text-xs">Organic</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {new Date(event.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'install' && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4">Install Pixel Code</h2>
              <p className="text-gray-600 mb-4">
                Add this code to the &lt;head&gt; section of every page on your website.
              </p>
              <div className="relative">
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto text-sm">
                  {getInstallCode()}
                </pre>
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 px-3 py-1 bg-white text-gray-700 rounded text-sm hover:bg-gray-100"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="mt-6">
                <h3 className="font-medium mb-2">Track Custom Events</h3>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm">{`qads('track', 'Purchase', {\n  value: 49.99,\n  currency: 'USD',\n  content_ids: ['product_123']\n});`}</pre>
              </div>
            </div>
          )}

          {activeTab === 'test' && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Test Events</h2>
                <button
                  onClick={runTestEvents}
                  disabled={testing}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50"
                >
                  {testing ? 'Testing...' : 'Run Test'}
                </button>
              </div>
              <div className="space-y-3">
                {testEvents.map((test, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg ${test.status === 'success' ? 'bg-green-50' : test.status === 'failed' ? 'bg-red-50' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>
                        {test.status === 'success' ? '✅' : test.status === 'failed' ? '❌' : '⏳'}
                      </span>
                      <span className="font-medium text-sm">{test.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">{test.details}</span>
                  </div>
                ))}
                {testEvents.length === 0 && !testing && (
                  <p className="text-center text-gray-500 py-8">
                    Click "Run Test" to verify your pixel installation
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'attribution' && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4">Conversion Attribution</h2>
              {attributionModels.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No attribution data yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {attributionModels.map((model, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <h3 className="font-medium capitalize">{model.type.replace('_', ' ')}</h3>
                      <p className="text-xs text-gray-500">{model.window}-day window</p>
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Conversions</span>
                          <span className="font-medium">{model.conversions}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Revenue</span>
                          <span className="font-medium">${model.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {pixels.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-6xl mb-4">📡</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No pixels configured</h3>
          <p className="text-gray-500">Create a pixel to start tracking conversions.</p>
        </div>
      )}
    </motion.div>
  );
};

export default PixelsPage;
