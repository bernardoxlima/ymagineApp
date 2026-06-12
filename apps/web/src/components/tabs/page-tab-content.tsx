'use client';

import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { AppLoader } from '@/components/ui/app-loader';

const DEPLOYMENTS_ENABLED = process.env.NEXT_PUBLIC_KORTIX_DEPLOYMENTS_ENABLED === 'true';

// ---------------------------------------------------------------------------
// Lazy-load every route-based page component so they can be pre-mounted in the
// DOM and kept alive when the user switches tabs (CSS show/hide).
// ---------------------------------------------------------------------------

// Import thunks for the hottest tabs are named so they can ALSO be warmed up
// during browser idle time after the dashboard settles (HOT_TAB_CHUNK_THUNKS,
// consumed by dashboard/layout-content). Without the warmup, the first click
// on each tab pays a chunk round-trip to the server before anything renders.
const loadDashboardContent = () =>
	import('@/components/dashboard/dashboard-content').then((m) => ({
		default: m.DashboardContent,
	}));
const loadWorkspacePage = () => import('@/app/(dashboard)/workspace/page');
const loadFilesPage = () =>
	import('@/features/files/components/file-explorer-page').then((m) => ({
		default: m.FileExplorerPage,
	}));
const loadMarketplacePage = () =>
	import('@/features/skills/components/marketplace').then((m) => ({
		default: m.Marketplace,
	}));
const loadProjectViewPage = () => import('@/app/(dashboard)/projects/[id]/page');

/**
 * Chunk-warmup thunks for the most-visited pre-mounted tabs, in priority
 * order. Consumed by the dashboard layout during requestIdleCallback so the
 * first open of these tabs is a pure CSS show instead of a network fetch.
 */
export const HOT_TAB_CHUNK_THUNKS: ReadonlyArray<() => Promise<unknown>> = [
	loadDashboardContent,
	loadWorkspacePage,
	loadFilesPage,
	loadProjectViewPage,
	loadMarketplacePage,
];

const DashboardContent = lazy(loadDashboardContent);

const SecretsPage = lazy(() =>
	import('@/app/(dashboard)/settings/credentials/page'),
);

const ApiKeysPage = lazy(() =>
	import('@/app/(dashboard)/settings/api-keys/page'),
);

const ProvidersPage = lazy(() =>
	import('@/app/(dashboard)/settings/providers/page'),
);

const CreditsPage = lazy(() =>
	import('@/app/(dashboard)/credits-explained/page'),
);

const ChangelogPage = lazy(() =>
	import('@/app/(dashboard)/changelog/page'),
);

const WorkspacePage = lazy(loadWorkspacePage);

const TriggersPage = lazy(() =>
	import('@/components/scheduled-tasks/scheduled-tasks-page').then((m) => ({
		default: m.ScheduledTasksPage,
	})),
);

const ChannelsPage = lazy(() =>
	import('@/components/channels/channels-page').then((m) => ({
		default: m.ChannelsPage,
	})),
);

const IntegrationsPage = lazy(() =>
	import('@/components/integrations/integrations-page').then((m) => ({
		default: m.IntegrationsPage,
	})),
);

const TunnelOverviewPage = lazy(() =>
	import('@/components/tunnel/tunnel-overview').then((m) => ({
		default: m.TunnelOverview,
	})),
);

const FilesPage = lazy(loadFilesPage);

const BoardPage = lazy(() => import('@/app/(dashboard)/board/page'));

const MarketplacePage = lazy(loadMarketplacePage);

const DeploymentsPage = lazy(() =>
	import('@/components/deployments/deployments-page').then((m) => ({
		default: m.DeploymentsPage,
	})),
);

// Admin pages (currently live under the dashboard route group)
const AdminAnalyticsPage = lazy(() =>
	import('@/app/(dashboard)/admin/analytics/page'),
);
const AdminFeedbackPage = lazy(() =>
	import('@/app/(dashboard)/admin/feedback/page'),
);
const AdminNotificationsPage = lazy(() =>
	import('@/app/(dashboard)/admin/notifications/page'),
);
const AdminSandboxPoolPage = lazy(() =>
	import('@/app/(dashboard)/admin/sandbox-pool/page'),
);
const AdminStressTestPage = lazy(() =>
	import('@/app/(dashboard)/admin/stress-test/page'),
);
const LegacyThreadPage = lazy(() =>
	import('@/app/(dashboard)/legacy/[threadId]/page'),
);

const TaskDetailPage = lazy(() =>
	import('@/app/(dashboard)/tasks/[id]/page'),
);

const ProjectViewPage = lazy(loadProjectViewPage);

// ---------------------------------------------------------------------------
// Route → Component mapping
// ---------------------------------------------------------------------------

const PAGE_COMPONENTS: Record<string, ComponentType> = {
	'/dashboard': DashboardContent,
	'/configuration': WorkspacePage,
	'/settings/credentials': SecretsPage,
	'/settings/api-keys': ApiKeysPage,
	'/settings/providers': ProvidersPage,
	'/credits-explained': CreditsPage,
	'/changelog': ChangelogPage,
	'/workspace': WorkspacePage,
	// Marketplace - browse and install all components from registry
	'/marketplace': MarketplacePage,
	'/skills': MarketplacePage, // backwards compat
	'/tools': WorkspacePage,
	'/commands': WorkspacePage,
	'/agents': WorkspacePage,
	// Extra pages not in original ROUTE_MAP but exist as routes
	'/scheduled-tasks': TriggersPage,
	'/channels': ChannelsPage,
	'/connectors': IntegrationsPage,
	'/files': FilesPage,
	'/board': BoardPage,
	'/tunnel': TunnelOverviewPage,
	...(DEPLOYMENTS_ENABLED ? { '/deployments': DeploymentsPage } : {}),
	// Admin
	'/admin/analytics': AdminAnalyticsPage,
	'/admin/feedback': AdminFeedbackPage,
	'/admin/notifications': AdminNotificationsPage,
	'/admin/sandbox-pool': AdminSandboxPoolPage,
	'/admin/stress-test': AdminStressTestPage,
};

function resolveComponent(routeKey: string): { Component: ComponentType<any>; params?: Record<string, string> } | null {
	const exact = PAGE_COMPONENTS[routeKey];
	if (exact) return { Component: exact };

	const legacyMatch = routeKey.match(/^\/legacy\/(.+)$/);
	if (legacyMatch) {
		return { Component: LegacyThreadPage, params: { threadId: legacyMatch[1] } };
	}

	const taskMatch = routeKey.match(/^\/tasks\/([^/]+)$/);
	if (taskMatch) {
		return { Component: TaskDetailPage, params: { id: decodeURIComponent(taskMatch[1]) } };
	}

	const projectMatch = routeKey.match(/^\/projects\/([^/]+)$/);
	if (projectMatch) {
		return { Component: ProjectViewPage, params: { id: decodeURIComponent(projectMatch[1]) } };
	}

	return null;
}

export function PageTabContent({ href }: { href: string }) {
	const routeKey = useMemo(() => {
		try {
			return new URL(href, window.location.origin).pathname;
		} catch {
			return href.split('?')[0]?.split('#')[0] || href;
		}
	}, [href]);

	const resolved = useMemo(() => resolveComponent(routeKey), [routeKey]);

	// IMPORTANT: memoize the params Promise so we hand the SAME promise
	// reference to `use()` across re-renders. A new Promise instance every
	// render makes React.use() re-suspend → Suspense fallback flashes →
	// the user sees a loader spinner every time the parent re-renders.
	const paramsPromise = useMemo(
		() => (resolved?.params ? Promise.resolve(resolved.params) : undefined),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[resolved?.params && JSON.stringify(resolved.params)],
	);

	if (!resolved) {
		return (
			<div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
				Page not found
			</div>
		);
	}

	const { Component } = resolved;

	return (
		<Suspense
			fallback={
				<div className="flex-1 flex items-center justify-center">
					<AppLoader size="medium" />
				</div>
			}
		>
			<Component params={paramsPromise} />
		</Suspense>
	);
}
