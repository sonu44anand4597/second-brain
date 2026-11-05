import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceProvider } from './app/Workspace';
import { api, APIError } from './lib/api';
import { Button, ErrorState, Skeleton } from './components/ui';
import Shell from './components/layout/Shell';
import Auth from './features/auth/Auth';
import type { User } from './types';
const Home = lazy(() => import('./features/dashboard/Home'));
const Library = lazy(() => import('./features/library/Library'));
const Collections = lazy(() => import('./features/collections/Collections'));
const Graph = lazy(() => import('./features/knowledge-graph/Graph'));
const Ask = lazy(() => import('./features/ai/Ask'));
const Recall = lazy(() => import('./features/recall/Recall'));
const Sharing = lazy(() => import('./features/sharing/Sharing'));
const PublicBrain = lazy(() => import('./features/sharing/Sharing').then(module => ({ default: module.PublicBrain })));
const Settings = lazy(() => import('./features/settings/Settings'));
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: (count, error) => count < 1 && !(error instanceof APIError && [401, 403, 404].includes(error.status)) }, mutations: { retry: false } } });
function Session() {
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => api<{ user: User }>('/me', { signal }), retry: false });
  useEffect(() => { const expired = () => { queryClient.setQueryData(['me'], { user: null }); queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'me' }); }; window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, [queryClient]);
  if (session.isPending) return <div className="session-loading"><span className="eyebrow">OPENING YOUR WORKSPACE</span><Skeleton cards={3}/></div>;
  if (session.data && !session.data.user) return <Auth/>;
  if (session.error instanceof APIError && session.error.status === 401) return <Auth/>;
  if (session.error) return <div className="session-loading"><ErrorState error={session.error} retry={() => void session.refetch()}/></div>;
  return <WorkspaceProvider><Shell user={session.data!.user}/></WorkspaceProvider>;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="session-loading"><h1>Let’s find our place again.</h1><p>The workspace encountered an unexpected error. Your saved resources are safe on the server.</p><Button onClick={() => window.location.reload()}>Reload workspace</Button></div> : this.props.children; }
}
export default function App() { return <ErrorBoundary><QueryClientProvider client={client}><BrowserRouter><Suspense fallback={<div className="route-loading"><Skeleton cards={3}/></div>}><Routes><Route path="/shared/:hash" element={<PublicBrain/>}/><Route element={<Session/>}><Route index element={<Home/>}/><Route path="library" element={<Library/>}/><Route path="collections" element={<Collections/>}/><Route path="graph" element={<Graph/>}/><Route path="ask" element={<Ask/>}/><Route path="recall" element={<Recall/>}/><Route path="sharing" element={<Sharing/>}/><Route path="settings" element={<Settings/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route><Route element={<Outlet/>}/></Routes></Suspense></BrowserRouter></QueryClientProvider></ErrorBoundary>; }
