'use client';

/**
 * Per-project view — full work-surface layout scoped to a single project id
 * from the route (the-big-1, watson, …).
 *
 * Uses the shared `ProjectHeader` (v2 tab set: About · Board · Milestones ·
 * Files · Sessions · Settings) so a project opened from the sidebar shows the
 * same organisation as the canonical workspace. Team / Credentials / Triggers
 * / Channels / Board-config are folded INTO Settings (sub-pills) — they are
 * not top-level tabs. `projectId` comes from the route instead of the
 * hardcoded `proj-workspace`, so each project shows its OWN board/tickets/
 * milestones/team/context.
 *
 * Re-wires the `ProjectHeader` + `ProjectAbout` + `ProjectSettingsTab`
 * components that the single-workspace collapse (D-022) left orphaned.
 *
 * Gated by `featureFlags.enableProjects` — when off, redirects to /workspace.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { featureFlags } from '@/lib/feature-flags';
import { useKortixProject, useKortixProjectSessions } from '@/hooks/kortix/use-kortix-projects';
import { createFilesStore, FilesStoreProvider } from '@/features/files/store/files-store';
import { FileExplorerPage } from '@/features/files/components/file-explorer-page';
import { openTabAndNavigate } from '@/stores/tab-store';
import { formatCost, formatTokens, COST_MARKUP } from '@/ui/turns';
import { relativeTime } from '@/lib/kortix/task-meta';
import {
  useTickets,
  useColumns,
  useProjectAgents,
  useFields,
  useUpdateTicketStatus,
  useDeleteTicket,
  type Ticket,
} from '@/hooks/kortix/use-kortix-tickets';
import { TicketBoard } from '@/components/kortix/ticket-board';
import { NewTicketDialog } from '@/components/kortix/new-ticket-dialog';
import { TicketDetailDrawer } from '@/components/kortix/ticket-detail-drawer';
import { MilestonesTab } from '@/components/kortix/milestones-tab';
import { ProjectHeader, type ProjectTab } from '@/components/kortix/project-header';
import { ProjectAbout } from '@/components/kortix/project-about';
import { ProjectSettingsTab, type SettingsSection } from '@/components/kortix/project-settings-tab';

function WorkspaceRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/workspace'); }, [router]);
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Redirecting to workspace…
    </div>
  );
}

export default function ProjectPage({ params }: { params?: Promise<{ id: string }> }) {
  // Accept `params` as a prop (Promise) so this page renders BOTH as a real
  // route AND when mounted by the tab system (PageTabContent passes params).
  // Mirrors /tasks/[id]/page.tsx. (D-022)
  const { id: raw } = params ? use(params) : { id: '' };
  const projectId = raw ? decodeURIComponent(raw) : '';
  // featureFlags.enableProjects is a build-time const → no hooks-order risk.
  if (!featureFlags.enableProjects || !projectId) return <WorkspaceRedirect />;
  return <ProjectInner projectId={projectId} />;
}

function ProjectInner({ projectId }: { projectId: string }) {
  const { data: project } = useKortixProject(projectId);
  // Land on About — the project's CONTEXT.md is the natural overview, same as
  // the first tab in `ProjectHeader`'s v2 set.
  const [tab, setTab] = useState<ProjectTab>('about');
  // Settings sub-section lifted here so it survives tab-away / tab-back.
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('team');
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [newTicketDefaultStatus, setNewTicketDefaultStatus] = useState<string | undefined>();

  const { data: columns = [] } = useColumns(projectId);

  // Per-project file explorer store (isolated from the global /files tab),
  // rooted at this project's path. (D-022)
  const projectFilesStore = useRef(createFilesStore()).current;
  useEffect(() => {
    if (project?.path && project.path !== '/') {
      const { setRootPath, navigateToPath } = projectFilesStore.getState();
      setRootPath(project.path);
      navigateToPath(project.path);
    }
  }, [project?.path, projectFilesStore]);

  const openNewTicket = useCallback((status?: string) => {
    setNewTicketDefaultStatus(status);
    setNewTicketOpen(true);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Shared header — project name + v2 underline tabs, New-ticket button
          always visible (matches the reference: About/Sessions show it too). */}
      <ProjectHeader
        project={project ?? { name: 'Projeto' }}
        tab={tab}
        onTabChange={setTab}
        onNewTask={() => openNewTicket()}
        // This page implements the v2 work surfaces (tickets/board); always
        // render the v2 tab set regardless of the stored structure_version.
        structureVersion={2}
      />

      {/* Body — pre-mounted TabPanels; inactive hidden via CSS so state survives. */}
      <div className="flex-1 min-h-0 relative">
        <TabPanel active={tab === 'about'}>
          {project ? (
            <ProjectAbout project={project} />
          ) : (
            <CenteredLoader />
          )}
        </TabPanel>
        <TabPanel active={tab === 'board'}>
          <BoardTabPanel projectId={projectId} columns={columns} onNewTicket={openNewTicket} />
        </TabPanel>
        <TabPanel active={tab === 'milestones'}>
          <MilestonesTab projectId={projectId} />
        </TabPanel>
        <TabPanel active={tab === 'files'}>
          {project?.path && project.path !== '/' ? (
            <FilesStoreProvider store={projectFilesStore}>
              <FileExplorerPage />
            </FilesStoreProvider>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sem pasta de arquivos para este projeto
            </div>
          )}
        </TabPanel>
        <TabPanel active={tab === 'sessions'}>
          <ProjectSessions projectId={projectId} enabled={tab === 'sessions'} />
        </TabPanel>
        <TabPanel active={tab === 'settings'}>
          <ProjectSettingsTab
            projectId={projectId}
            projectPath={project?.path}
            section={settingsSection}
            onSectionChange={setSettingsSection}
          />
        </TabPanel>
      </div>

      <NewTicketDialog
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        projectId={projectId}
        columns={columns}
        defaultStatus={newTicketDefaultStatus}
      />
    </div>
  );
}

function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('absolute inset-0 flex flex-col overflow-hidden', !active && 'hidden')}>
      {children}
    </div>
  );
}

function CenteredLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** input+output tokens for a session usage rollup (matches session-chat's display). */
function usageTokens(u: any): number {
  return (u?.tokens?.input ?? 0) + (u?.tokens?.output ?? 0);
}

function ProjectSessions({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  // ?usage=1 → the sandbox rolls up per-session cost/tokens/messageCount. The
  // field is absent (undefined) on older sandbox images, so every read of
  // `s.usage` degrades gracefully (totals bar hides, rows omit the meta).
  // Two parallel queries (distinct cache keys: 'base' vs 'usage' — see
  // useKortixProjectSessions). The cheap base list (id/title/time) paints the
  // rows immediately; the slower ?usage=1 rollup (N sequential OpenCode message
  // fetches, claude-failure-modes §14.3) streams in afterward to fill the totals
  // bar + per-row cost. The base data is the REAL, final session list — not a
  // skeleton/placeholder — so showing it first is honest, and the loader gate
  // keys on the BASE query only.
  const { data: baseSessions = [], isLoading } = useKortixProjectSessions(projectId, { enabled, usage: false });
  const { data: usageSessions = [] } = useKortixProjectSessions(projectId, { enabled, usage: true });

  const usageById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of usageSessions as any[]) if (s?.id) m.set(s.id, (s as any).usage);
    return m;
  }, [usageSessions]);

  const list = useMemo(
    () => [...(baseSessions as any[])]
      .filter((s) => !s?.parentID)
      .sort((a, b) => (b?.time?.updated ?? 0) - (a?.time?.updated ?? 0))
      .map((s) => (usageById.has(s.id) ? { ...s, usage: usageById.get(s.id) } : s)),
    [baseSessions, usageById],
  );

  const totals = useMemo(() => {
    let cost = 0, tokens = 0, messages = 0, anyUsage = false;
    for (const s of list) {
      const u = (s as any).usage;
      if (!u) continue;
      anyUsage = true;
      cost += u.cost ?? 0;
      tokens += usageTokens(u);
      messages += u.messageCount ?? 0;
    }
    // Raw provider cost → apply COST_MARKUP so it matches the session view + billing.
    return { sessions: list.length, messages, tokens, cost: cost * COST_MARKUP, anyUsage };
  }, [list]);

  // Gate the loader on the BASE query only (the cheap list) — never on the slow
  // usage fan-out, which would re-introduce the multi-second "Nenhuma sessão"
  // flash (claude-failure-modes §14.3). Keeps isLoading-before-empty.
  if (isLoading && list.length === 0) {
    return <CenteredLoader />;
  }

  if (list.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Nenhuma sessão neste projeto ainda
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 space-y-5">
        {/* PROJECT TOTALS — only when the sandbox returned usage rollups. */}
        {totals.anyUsage && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl border border-border/40 bg-border/40 overflow-hidden">
            <TotalCell label="Sessions" value={String(totals.sessions)} />
            <TotalCell label="Messages" value={totals.messages.toLocaleString()} />
            <TotalCell label="Tokens" value={formatTokens(totals.tokens)} />
            <TotalCell label="Cost" value={formatCost(totals.cost)} />
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/55 font-semibold">Chats</span>
            <span className="text-[10px] text-muted-foreground/30 tabular-nums">{list.length}</span>
          </div>
          <div className="space-y-0.5">
            {list.map((s) => {
              const u = (s as any).usage;
              return (
                <button
                  key={s.id}
                  data-session-row={s.id}
                  onClick={() => openTabAndNavigate({
                    id: s.id,
                    title: s.title || 'Sessão',
                    type: 'session',
                    href: `/sessions/${s.id}`,
                  })}
                  className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-left text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors cursor-pointer"
                >
                  <span className="flex-1 truncate">{s.title || 'Sessão sem título'}</span>
                  {u && (
                    <span className="shrink-0 text-[11px] text-muted-foreground/45 tabular-nums hidden sm:inline">
                      {formatTokens(usageTokens(u))} · {formatCost((u.cost ?? 0) * COST_MARKUP)}
                    </span>
                  )}
                  {s?.time?.updated && (
                    <span className="shrink-0 text-[11px] text-muted-foreground/35 tabular-nums w-16 text-right hidden sm:inline">
                      {relativeTime(s.time.updated)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/55 font-semibold mb-1">{label}</div>
      <div className="text-[18px] font-semibold tracking-tight tabular-nums text-foreground/90">{value}</div>
    </div>
  );
}

function BoardTabPanel({
  projectId,
  columns,
  onNewTicket,
}: {
  projectId: string;
  columns: ReturnType<typeof useColumns>['data'] extends infer T ? T : never;
  onNewTicket: (status?: string) => void;
}) {
  const { data: tickets = [], isLoading } = useTickets(projectId, { enabled: true });
  const { data: agents = [] } = useProjectAgents(projectId);
  const { data: fields = [] } = useFields(projectId);

  const updateTicketStatus = useUpdateTicketStatus();
  const deleteTicket = useDeleteTicket();

  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const openTicket = useCallback((t: Ticket) => setOpenTicketId(t.id), []);
  const closeTicket = useCallback(() => setOpenTicketId(null), []);

  if (isLoading) {
    return <CenteredLoader />;
  }

  return (
    <div className="flex h-full flex-col">
      <TicketBoard
        tickets={tickets}
        columns={columns ?? []}
        agents={agents}
        onOpenTicket={openTicket}
        onNewTicket={onNewTicket}
        onUpdateStatus={(id, status) => updateTicketStatus.mutate({ id, status })}
        onDeleteTicket={(id) => deleteTicket.mutate(id)}
      />
      <TicketDetailDrawer
        ticketId={openTicketId}
        onClose={closeTicket}
        columns={columns ?? []}
        fields={fields}
        agents={agents}
        pollingEnabled={!!openTicketId}
      />
    </div>
  );
}
