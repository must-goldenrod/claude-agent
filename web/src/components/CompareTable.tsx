import { useState, useMemo } from 'react';

interface Agent {
  name: string;
  description: string;
  version: string;
  composite: number | null;
  tags: string[];
  model: string;
  total_executions: number;
  performance?: {
    quality: number;
    efficiency: number;
    reliability: number;
    impact: number;
    composite: number;
  };
}

interface Props {
  agents: Agent[];
}

export default function CompareTable({ agents }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const agentMap = useMemo(() => {
    const map: Record<string, Agent> = {};
    agents.forEach(a => { map[a.name] = a; });
    return map;
  }, [agents]);

  const addAgent = (name: string) => {
    if (name && selected.length < 3 && !selected.includes(name)) {
      setSelected([...selected, name]);
    }
  };

  const removeAgent = (name: string) => {
    setSelected(selected.filter(n => n !== name));
  };

  const selectedAgents = selected.map(n => agentMap[n]).filter(Boolean);
  const metrics = ['composite', 'quality', 'efficiency', 'reliability', 'impact'] as const;

  const getScore = (agent: Agent, metric: string): number | null => {
    if (metric === 'composite') return agent.composite;
    return agent.performance?.[metric as keyof Omit<NonNullable<Agent['performance']>, 'composite'>] ?? null;
  };

  const getBest = (metric: string): string | null => {
    if (selectedAgents.length < 2) return null;
    let best = selectedAgents[0];
    for (const a of selectedAgents.slice(1)) {
      if ((getScore(a, metric) ?? 0) > (getScore(best, metric) ?? 0)) best = a;
    }
    return best.name;
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        {selected.map((name) => (
          <div key={name} className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2">
            <span className="font-medium text-sm">{name}</span>
            <button onClick={() => removeAgent(name)} className="text-gray-400 hover:text-red-500 text-lg leading-none">&times;</button>
          </div>
        ))}
        {selected.length < 3 && (
          <select
            value=""
            onChange={e => addAgent(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">+ Add agent</option>
            {agents
              .filter(a => !selected.includes(a.name))
              .map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        )}
      </div>

      {selectedAgents.length >= 2 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Metric</th>
                {selectedAgents.map(a => (
                  <th key={a.name} className="text-left py-3 px-4 font-medium text-gray-900">{a.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2 px-4 text-gray-600">Version</td>
                {selectedAgents.map(a => (
                  <td key={a.name} className="py-2 px-4">{a.version}</td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 px-4 text-gray-600">Model</td>
                {selectedAgents.map(a => (
                  <td key={a.name} className="py-2 px-4">{a.model}</td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 px-4 text-gray-600">Executions</td>
                {selectedAgents.map(a => (
                  <td key={a.name} className="py-2 px-4">{a.total_executions}</td>
                ))}
              </tr>
              {metrics.map(metric => {
                const best = getBest(metric);
                return (
                  <tr key={metric} className="border-b border-gray-100">
                    <td className="py-2 px-4 text-gray-600 capitalize font-medium">{metric}</td>
                    {selectedAgents.map(a => {
                      const score = getScore(a, metric);
                      const isBest = a.name === best;
                      return (
                        <td key={a.name} className={`py-2 px-4 font-mono ${isBest ? 'font-bold text-green-600' : ''}`}>
                          {score != null ? score.toFixed(2) : 'N/A'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          <p>Select at least 2 agents to compare.</p>
        </div>
      )}
    </div>
  );
}
