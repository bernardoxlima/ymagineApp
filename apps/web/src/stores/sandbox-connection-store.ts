import { create } from "zustand";
import { logger } from "@/lib/logger";

export type SandboxConnectionStatus =
	| "connecting"
	| "connected"
	| "unreachable";

export type SandboxRecoveryPhase =
	| "idle"
	| "restarting_workload"
	| "restarting_runtime"
	| "restarting_host";

interface SandboxConnectionStore {
	status: SandboxConnectionStatus;
	/** How many consecutive health-check failures */
	failCount: number;
	/** When the connection was last confirmed */
	lastConnectedAt: number | null;
	/** True once at least one health check has completed (success or fail) */
	initialCheckDone: boolean;
	/** True if we were connected at some point and then lost connection */
	wasConnected: boolean;
	/** Total reconnect attempts since last successful connection */
	reconnectAttempts: number;
	/** Timestamp when status changed to unreachable/connecting (for "down since") */
	disconnectedAt: number | null;
	/** Current sandbox version from /kortix/health (e.g. "0.5.1") */
	sandboxVersion: string | null;
	/** OpenCode server version from /global/health (e.g. "1.2.10") */
	openCodeVersion: string | null;
	/** Whether the OpenCode server reports healthy */
	healthy: boolean | null;
	recoveryPhase: SandboxRecoveryPhase;
	restartRequestedAt: number | null;
}

// ── Persist wasConnected across hard refreshes and new tabs ──
// On cold load, wasConnected=false triggers the full-screen blocking overlay
// AND serializes every data fetch behind the first health check. By persisting
// it (localStorage so new tabs benefit too), a browser that has connected to
// the persisted active server before boots optimistically: cached UI paints
// immediately and data queries run in parallel with the first health check.
// The health poller corrects the state if the sandbox is actually down.
const STORAGE_KEY = "kortix-sandbox-was-connected";
const PROVISION_VERIFIED_KEY = "kortix-sandbox-provision-verified";

function loadWasConnected(): boolean {
	try {
		return (
			localStorage.getItem(STORAGE_KEY) === "1" ||
			// Legacy location (pre-localStorage) — still honored so existing
			// sessions don't regress to the blocking overlay after deploy.
			sessionStorage.getItem(STORAGE_KEY) === "1"
		);
	} catch {
		return false;
	}
}

function saveWasConnected(value: boolean) {
	try {
		if (value) {
			localStorage.setItem(STORAGE_KEY, "1");
		} else {
			localStorage.removeItem(STORAGE_KEY);
			sessionStorage.removeItem(STORAGE_KEY);
		}
	} catch {
		/* SSR or storage unavailable */
	}
}

function loadProvisionVerified(): boolean {
	try {
		return sessionStorage.getItem(PROVISION_VERIFIED_KEY) === "1";
	} catch {
		return false;
	}
}

function clearProvisionVerified() {
	try {
		sessionStorage.removeItem(PROVISION_VERIFIED_KEY);
	} catch {
		/* SSR or storage unavailable */
	}
}

export const useSandboxConnectionStore = create<SandboxConnectionStore>(() => ({
	status: "connecting",
	failCount: 0,
	lastConnectedAt: null,
	initialCheckDone: false,
	wasConnected: loadWasConnected(),
	reconnectAttempts: 0,
	disconnectedAt: null,
	sandboxVersion: null,
	openCodeVersion: null,
	healthy: null,
	recoveryPhase: "idle",
	restartRequestedAt: null,
}));

// ── Static actions (stable references, no re-render loops) ──

/** Only updates status if it actually changed. */
export function setSandboxStatus(next: SandboxConnectionStatus) {
	const state = useSandboxConnectionStore.getState();
	if (state.status === next) return;

	const updates: Partial<SandboxConnectionStore> = { status: next };

	if (next === "connected") {
		updates.lastConnectedAt = Date.now();
		updates.failCount = 0;
		updates.wasConnected = true;
		updates.reconnectAttempts = 0;
		updates.disconnectedAt = null;
		updates.recoveryPhase = "idle";
		updates.restartRequestedAt = null;
		saveWasConnected(true);

		if (state.status === "unreachable") {
			logger.info("Sandbox connection restored", {
				previousStatus: state.status,
				reconnectAttempts: state.reconnectAttempts,
			});
		}
	} else if (next === "unreachable") {
		if (!state.disconnectedAt) {
			updates.disconnectedAt = Date.now();
		}
		logger.warn("Sandbox became unreachable", {
			failCount: state.failCount,
			reconnectAttempts: state.reconnectAttempts,
			wasConnected: state.wasConnected,
		});
	} else if (next === "connecting") {
		// Track when we first went down (don't overwrite if already set)
		if (!state.disconnectedAt) {
			updates.disconnectedAt = Date.now();
		}
	}

	useSandboxConnectionStore.setState(updates);
}

export function markInitialCheckDone() {
	if (useSandboxConnectionStore.getState().initialCheckDone) return; // no-op
	useSandboxConnectionStore.setState({ initialCheckDone: true });
}

export function incrementSandboxFail() {
	const state = useSandboxConnectionStore.getState();
	logger.warn("Sandbox health-check failed", {
		failCount: state.failCount + 1,
		reconnectAttempts: state.reconnectAttempts + 1,
	});
	useSandboxConnectionStore.setState((s) => ({
		failCount: s.failCount + 1,
		reconnectAttempts: s.reconnectAttempts + 1,
	}));
}

export function resetSandboxFail() {
	const { failCount } = useSandboxConnectionStore.getState();
	if (failCount === 0) return; // no-op — avoids unnecessary re-renders
	useSandboxConnectionStore.setState({ failCount: 0 });
}

/**
 * Full reset for server switches — clears ALL connection state so the new
 * instance starts fresh. Without this, `wasConnected` from a previous instance
 * leaks into the new one, causing wrong thresholds and stale UI.
 *
 * Exception: if the provisioning page just verified health and set the
 * PROVISION_VERIFIED_KEY flag, we start as "connected" with wasConnected=true
 * so the dashboard doesn't show a blocking overlay during the transition.
 *
 * `preserveWasConnected`: pass true on the FIRST mount of a cold load — the
 * active server is the same persisted one from the last session, so the
 * persisted wasConnected hint is still about the right server. Wiping it here
 * (the old behavior) defeated the persistence and forced the blocking overlay
 * plus a serialized health-check→data waterfall on every cold load.
 */
export function resetForServerSwitch(opts?: { preserveWasConnected?: boolean }) {
	const fromProvisioning = loadProvisionVerified();
	clearProvisionVerified();

	if (fromProvisioning) {
		// Provisioning already verified health — skip the blocking overlay.
		// The health poller will still run and correct the status if needed.
		useSandboxConnectionStore.setState({
			status: "connecting",
			failCount: 0,
			initialCheckDone: false,
			wasConnected: true, // lightweight reconnect pill instead of blocking overlay
			reconnectAttempts: 0,
			disconnectedAt: null,
			sandboxVersion: null,
			openCodeVersion: null,
		healthy: null,
		recoveryPhase: "idle",
		restartRequestedAt: null,
		});
		saveWasConnected(true);
		return;
	}

	const preserved = !!opts?.preserveWasConnected && loadWasConnected();

	useSandboxConnectionStore.setState({
		status: "connecting",
		failCount: 0,
		initialCheckDone: false,
		wasConnected: preserved,
		reconnectAttempts: 0,
		disconnectedAt: null,
		sandboxVersion: null,
		openCodeVersion: null,
		healthy: null,
		recoveryPhase: "idle",
		restartRequestedAt: null,
	});
	if (!preserved) saveWasConnected(false);
}

export function markRecoveryRequested(phase: Exclude<SandboxRecoveryPhase, 'idle'>) {
	const now = Date.now();
	useSandboxConnectionStore.setState((state) => ({
		recoveryPhase: phase,
		restartRequestedAt: now,
		status: state.status === "connected" ? "connecting" : state.status,
		disconnectedAt: state.disconnectedAt ?? now,
	}));
}

export function markHostRestartRequested() {
	markRecoveryRequested("restarting_host");
}

/**
 * Called by the provisioning page right before redirecting to the dashboard.
 * Signals that the sandbox was already verified as healthy, so the dashboard
 * should NOT show a full-screen blocking overlay on first load.
 */
export function markProvisioningVerified() {
	try {
		sessionStorage.setItem(PROVISION_VERIFIED_KEY, "1");
	} catch {
		/* SSR or storage unavailable */
	}
}

export function setSandboxVersion(version: string | null) {
	const current = useSandboxConnectionStore.getState().sandboxVersion;
	if (current === version) return;
	useSandboxConnectionStore.setState({ sandboxVersion: version });
}

export function setOpenCodeHealth(healthy: boolean, version?: string) {
	const state = useSandboxConnectionStore.getState();
	const updates: Partial<SandboxConnectionStore> = {};
	if (state.healthy !== healthy) updates.healthy = healthy;
	if (version !== undefined && state.openCodeVersion !== version) updates.openCodeVersion = version;
	if (Object.keys(updates).length > 0) {
		useSandboxConnectionStore.setState(updates);
	}
}
