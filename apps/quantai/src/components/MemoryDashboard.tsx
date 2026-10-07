import React, { useState, useEffect } from 'react';

export const MemoryDashboard: React.FC = () => {
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMemory = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/personal-agent/context');
      const data = await response.json();
      setMemories(data.context || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemory();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Your AI Memory</h1>
        <button
          onClick={loadMemory}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading your memory...</div>
      ) : memories.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow">
          <p className="text-gray-500">
            No memories yet. Start interacting with your personal agent!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {memories.map((memory, index) => (
            <div key={index} className="bg-white rounded-xl shadow p-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-lg">{memory.type}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {new Date(memory.timestamp).toLocaleString()}
                  </div>
                </div>
                {memory.metadata?.sourceAgent && (
                  <span className="text-xs px-3 py-1 bg-gray-100 rounded-full">
                    {memory.metadata.sourceAgent}
                  </span>
                )}
              </div>
              <pre className="mt-4 text-sm bg-gray-50 p-4 rounded-lg overflow-auto">
                {JSON.stringify(memory.content, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
