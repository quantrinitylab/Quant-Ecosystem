import React, { useState } from 'react';

interface Agent {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
}

export const AgentDashboard: React.FC = () => {
  const [agents] = useState<Agent[]>([
    {
      id: 'quantai-agent',
      name: 'QuantAI Agent',
      status: 'active',
      capabilities: ['reasoning', 'tools'],
    },
    {
      id: 'quantmail-agent',
      name: 'QuantMail Agent',
      status: 'active',
      capabilities: ['email', 'calendar'],
    },
    {
      id: 'quantchat-agent',
      name: 'QuantChat Agent',
      status: 'active',
      capabilities: ['messaging', 'groups'],
    },
  ]);

  const [selectedAgent, setSelectedAgent] = useState('');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runAgent = async () => {
    if (!selectedAgent || !input) return;

    setLoading(true);
    try {
      const response = await fetch('/api/agentic/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent,
          input,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">QuantOS Agent Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agents List */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Available Agents</h2>
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className={`p-4 rounded-lg cursor-pointer transition ${
                  selectedAgent === agent.id
                    ? 'bg-blue-50 border-blue-500 border'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium">{agent.name}</div>
                <div className="text-sm text-gray-500 mt-1">{agent.capabilities.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Runner */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Run Agent</h2>

          <div className="space-y-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What would you like your agent to do?"
              className="w-full h-32 p-3 border rounded-lg resize-none"
            />

            <button
              onClick={runAgent}
              disabled={!selectedAgent || !input || loading}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:bg-gray-300"
            >
              {loading ? 'Running...' : 'Run Agent'}
            </button>

            {result && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="font-medium mb-2">Result:</div>
                <pre className="text-sm overflow-auto">{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
