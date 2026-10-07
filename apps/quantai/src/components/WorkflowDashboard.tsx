import React, { useState } from 'react';

export const WorkflowDashboard: React.FC = () => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [newWorkflow, setNewWorkflow] = useState({ name: '', goal: '' });
  const [loading, setLoading] = useState(false);

  const createWorkflow = async () => {
    if (!newWorkflow.name || !newWorkflow.goal) return;

    setLoading(true);
    try {
      const response = await fetch('/api/agentic/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkflow),
      });

      const data = await response.json();
      setWorkflows([...workflows, data.workflow]);
      setNewWorkflow({ name: '', goal: '' });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Autonomous Workflows</h1>

      {/* Create Workflow */}
      <div className="bg-white rounded-xl shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Create New Workflow</h2>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Workflow Name"
            value={newWorkflow.name}
            onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
            className="w-full p-3 border rounded-lg"
          />
          <textarea
            placeholder="What should this workflow accomplish?"
            value={newWorkflow.goal}
            onChange={(e) => setNewWorkflow({ ...newWorkflow, goal: e.target.value })}
            className="w-full h-24 p-3 border rounded-lg resize-none"
          />
          <button
            onClick={createWorkflow}
            disabled={loading}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium disabled:bg-gray-300"
          >
            {loading ? 'Creating...' : 'Create & Execute Workflow'}
          </button>
        </div>
      </div>

      {/* Workflows List */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Your Workflows</h2>
        {workflows.length === 0 ? (
          <p className="text-gray-500">No workflows yet. Create one above!</p>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <div className="font-medium">{workflow.name}</div>
                <div className="text-sm text-gray-500 mt-1">{workflow.goal}</div>
                <div className="text-xs text-gray-400 mt-2">Status: {workflow.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
