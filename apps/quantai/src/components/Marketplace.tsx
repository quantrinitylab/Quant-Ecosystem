import React, { useState, useEffect } from 'react';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  rating: number;
  downloads: number;
  author: string;
  price: number;
}

export const Marketplace: React.FC = () => {
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadAgents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/marketplace');
      const data = await response.json();
      setAgents(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.description.toLowerCase().includes(search.toLowerCase()),
  );

  const installAgent = async (agentId: string) => {
    try {
      await fetch(`/api/marketplace/${agentId}/install`, { method: 'POST' });
      alert('Agent installed successfully!');
    } catch (error) {
      alert('Failed to install agent');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Agent Marketplace</h1>
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 border rounded-lg w-64"
        />
      </div>

      {loading ? (
        <div className="text-center py-12">Loading agents...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map((agent) => (
            <div key={agent.id} className="bg-white rounded-xl shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{agent.name}</h3>
                  <p className="text-sm text-gray-500">{agent.author}</p>
                </div>
                <div className="text-right">
                  <div className="text-yellow-500">★ {agent.rating}</div>
                  <div className="text-xs text-gray-500">{agent.downloads} installs</div>
                </div>
              </div>

              <p className="text-gray-600 mb-4">{agent.description}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {agent.capabilities.map((cap) => (
                  <span key={cap} className="text-xs px-2 py-1 bg-gray-100 rounded">
                    {cap}
                  </span>
                ))}
              </div>

              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {agent.price === 0 ? 'Free' : `$${agent.price}`}
                </span>
                <button
                  onClick={() => installAgent(agent.id)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
                >
                  Install
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
