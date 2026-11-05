import { createContext, useContext, useState, type ReactNode } from 'react';
interface WorkspaceState { capture: boolean; setCapture: (open: boolean) => void; detailId: string | null; setDetailId: (id: string | null) => void; toast: (message: string) => void }
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [capture, setCapture] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  function toast(text: string) { const key = Date.now(); setNotice({ text, key }); window.setTimeout(() => setNotice(current => current?.key === key ? null : current), 4500); }
  return <WorkspaceContext.Provider value={{ capture, setCapture, detailId, setDetailId, toast }}>{children}{notice && <div className="toast" role="status">{notice.text}</div>}</WorkspaceContext.Provider>;
}
// oxlint-disable-next-line react/only-export-components -- context hook shared by workspace components
export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error('Workspace provider missing'); return value; }
