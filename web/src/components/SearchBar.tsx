import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';

interface Agent {
  name: string;
  description: string;
  version: string;
  composite: number | null;
  tags: string[];
  model: string;
  total_executions: number;
}

interface Props {
  agents: Agent[];
}

export default function SearchBar({ agents }: Props) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('composite');
  const [tagFilter, setTagFilter] = useState('');

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    agents.forEach(a => a.tags?.forEach(t => tags.add(t)));
    return [...tags].sort();
  }, [agents]);

  const fuse = useMemo(() => new Fuse(agents, {
    keys: ['name', 'description', 'tags'],
    threshold: 0.4,
  }), [agents]);

  const filtered = useMemo(() => {
    let result = query
      ? fuse.search(query).map(r => r.item)
      : [...agents];

    if (tagFilter) {
      result = result.filter(a => a.tags?.includes(tagFilter));
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'executions') return (b.total_executions ?? 0) - (a.total_executions ?? 0);
      return (b.composite ?? 0) - (a.composite ?? 0);
    });

    return result;
  }, [query, sortBy, tagFilter, agents, fuse]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search agents..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
        />
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="composite">Sort by Score</option>
          <option value="name">Sort by Name</option>
          <option value="executions">Sort by Executions</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-4">{filtered.length} agents found</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(a => (
          <a key={a.name} href={`/agents/${a.name}`}
             className="block bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-gray-900">{a.name}</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">v{a.version}</span>
            </div>
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{a.description || '(no description)'}</p>
            <div className="flex items-center gap-4 text-sm">
              <span className={`font-mono font-bold ${
                a.composite == null ? 'text-gray-500' :
                a.composite >= 0.8 ? 'text-green-600' :
                a.composite >= 0.6 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {a.composite != null ? a.composite.toFixed(2) : 'N/A'}
              </span>
              <span className="text-gray-500">{a.total_executions} runs</span>
              <span className="text-gray-500">{a.model}</span>
            </div>
            {a.tags?.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {a.tags.map(tag => (
                  <span key={tag} className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
