import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, ReactFlowProvider, useReactFlow, type Node, type NodeProps, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowUpRight, Network, Search } from 'lucide-react';
import { useCollections, useContent } from '../../hooks/data';
import { relationship, titleOf } from '../../lib/knowledge';
import { useWorkspace } from '../../app/Workspace';
import { Button, Empty, ErrorState, ExternalLink, PageTitle, Skeleton, TypeIcon } from '../../components/ui';
import type { Content } from '../../types';
type IdeaNode = Node<{ item: Content; highlighted: boolean; dimmed: boolean }, 'idea'>;
function Idea({ data }: NodeProps<IdeaNode>) { return <div className={`idea-node ${data.highlighted ? 'highlighted' : ''} ${data.dimmed ? 'dimmed' : ''}`}><Handle type="target" position={Position.Left}/><span className={`type-icon type-${data.item.type}`}><TypeIcon type={data.item.type}/></span><div><small>{data.item.type}</small><strong>{titleOf(data.item)}</strong><span>{data.item.tags.slice(0, 2).map(t => `#${t}`).join('  ')}</span></div><Handle type="source" position={Position.Right}/></div>; }
const nodeTypes = { idea: Idea };
export default function Graph() { return <ReactFlowProvider><GraphCanvas/></ReactFlowProvider>; }
function GraphCanvas() {
  const query = useContent(); const collections = useCollections(); const { setDetailId } = useWorkspace(); const flow = useReactFlow<IdeaNode>();
  const [selected, setSelected] = useState<string | null>(null); const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all');
  const items = useMemo(() => (query.data || []).slice(0, 100), [query.data]); const item = items.find(i => i._id === selected);
  const { nodes, edges } = useMemo(() => {
    const edges: Edge[] = []; const connectedIds = new Set<string>();
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!; const b = items[j]!; const reason = relationship(a, b);
      if (filter === 'tags' ? !reason.tags.length : filter === 'collections' ? !reason.collections.length : !reason.connected) continue;
      const active = !selected || a._id === selected || b._id === selected;
      if (selected && active) { connectedIds.add(a._id); connectedIds.add(b._id); }
      if (edges.length < 350) edges.push({ id: `${a._id}-${b._id}`, source: a._id, target: b._id, animated: Boolean(selected && active), label: selected && active ? (reason.tags.length ? `#${reason.tags[0]}` : 'same collection') : '', style: { stroke: active ? '#a494c8' : '#dbd7e3', strokeWidth: active && selected ? 2 : 1, opacity: active ? 1 : 0.25 } });
    }
    const nodes: IdeaNode[] = items.map((item, index) => {
      const ring = Math.floor(index / 12); const angle = (index % 12) / Math.min(12, items.length - ring * 12) * Math.PI * 2;
      const radius = items.length === 1 ? 0 : 280 + ring * 270;
      return { id: item._id, type: 'idea', position: { x: Math.cos(angle) * radius + 600, y: Math.sin(angle) * radius * 0.7 + 400 }, data: { item, highlighted: item._id === selected, dimmed: Boolean(selected && selected !== item._id && !connectedIds.has(item._id)) } };
    });
    return { nodes, edges };
  }, [items, filter, selected]);
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  function focus() { const target = items.find(i => titleOf(i).toLowerCase().includes(search.toLowerCase())); if (target) { setSelected(target._id); void flow.fitView({ nodes: [{ id: target._id }], duration: 450, maxZoom: 1.4 }); } }
  if (query.isPending) return <Skeleton cards={3}/>; if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()}/>;
  return <><PageTitle eyebrow="FOLLOW THE THREAD" title="Nothing exists in isolation." text="A living map of the relationships in your saved knowledge."/><div className="graph-toolbar"><div className="search-field"><Search size={17}/><input aria-label="Find a graph node" placeholder="Find an idea on the map…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') focus(); }}/><Button variant="ghost" disabled={!search} onClick={focus}>Focus</Button></div><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Graph relationship filter"><option value="all">All relationships</option><option value="tags">Shared tags</option><option value="collections">Shared collections</option></select></div>{!items.length ? <Empty icon={<Network size={28}/>} title="Every idea is a starting point." text="Save resources, then give them shared tags or collections. Their connections will appear here."/> : <div className="graph-layout"><div className="graph-canvas"><ReactFlow<IdeaNode> nodes={nodes.map(n => ({ ...n, position: moved[n.id] || n.position }))} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_e, node) => setSelected(node.id)} onPaneClick={() => setSelected(null)} onNodeDrag={(_e, node) => setMoved(current => ({ ...current, [node.id]: node.position }))} nodesConnectable={false} fitView minZoom={0.15} maxZoom={2} proOptions={{ hideAttribution: false }}><Background color="#d8d3e1" gap={24}/><Controls/><MiniMap pannable zoomable nodeColor="#b6a5d0"/></ReactFlow><div className="graph-caption">{nodes.length} ideas · {edges.length} relationships{query.data.length > 100 && ' · Showing 100 newest resources'}{edges.length === 350 && ' · Relationship rendering capped at 350'}</div></div><aside className="graph-detail">{item ? <><span className={`type-icon type-${item.type}`}><TypeIcon type={item.type}/></span><span className="eyebrow">A CLOSER LOOK</span><h2>{titleOf(item)}</h2><p>{item.description || item.text.slice(0, 160) || 'Add notes to develop this idea.'}</p><div className="tag-row">{item.tags.map(tag => <span key={tag} className="tag">#{tag}</span>)}</div><Button variant="secondary" onClick={() => setDetailId(item._id)}>Open resource<ArrowUpRight size={15}/></Button><ExternalLink href={item.link}/><h3>Connected through</h3>{items.filter(other => other._id !== item._id && relationship(item, other).connected).map(other => { const reason = relationship(item, other); return <button className="graph-related" key={other._id} onClick={() => setSelected(other._id)}><strong>{titleOf(other)}</strong><span>{reason.tags.map(t => `#${t}`).join(', ')}{reason.collections.map(id => collections.data?.find(c => c._id === id)?.name).filter(Boolean).map(name => ` · ${name}`)}</span></button>; })}</> : <><Network size={30}/><h2>Find the in-between.</h2><p>Select an idea to see what it connects to, and why.</p><div className="graph-legend"><span><i/>Shared tags</span><span><i/>Collection membership</span></div><p className="field-hint">Every line represents saved data. Drag to rearrange. Scroll to zoom. Use the controls to fit the map.</p></>}</aside></div>}</>;
}
