/**
 * Maintenance configuration store.
 *
 * Production: reads from Vercel Edge Config (ultra-fast edge reads),
 *             writes via the Vercel REST API.
 * Local dev:  falls back to an in-memory store so the admin panel
 *             works without any Vercel setup.
 *
 * Required env vars for production:
 *   EDGE_CONFIG           – connection string (set automatically by Vercel)
 *   EDGE_CONFIG_ID        – the Edge Config store ID
 *   VERCEL_API_TOKEN      – token with edge-config write scope
 */

import { createClient, type EdgeConfigClient } from '@vercel/edge-config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MaintenanceLevel = 'none' | 'info' | 'warning' | 'critical' | 'blocking';

export interface MaintenanceConfig {
  /** Current maintenance level */
  level: MaintenanceLevel;
  /** Short title shown in the banner / maintenance page */
  title: string;
  /** Longer description / message body */
  message: string;
  /** Optional: scheduled start time (ISO 8601) */
  startTime?: string | null;
  /** Optional: scheduled end time (ISO 8601) */
  endTime?: string | null;
  /** Optional: link to a status page */
  statusUrl?: string | null;
  /** Optional: list of affected service names */
  affectedServices?: string[];
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

const EDGE_CONFIG_KEY = 'maintenance_config';

const DEFAULT_CONFIG: MaintenanceConfig = {
  level: 'none',
  title: '',
  message: '',
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Edge Config client (singleton)
// ---------------------------------------------------------------------------

let _edgeClient: EdgeConfigClient | null = null;

function getEdgeClient(): EdgeConfigClient | null {
  if (_edgeClient) return _edgeClient;
  const connectionString = process.env.EDGE_CONFIG;
  if (!connectionString) return null;
  _edgeClient = createClient(connectionString);
  return _edgeClient;
}

// ---------------------------------------------------------------------------
// In-memory fallback for local dev
// ---------------------------------------------------------------------------

let _memoryStore: MaintenanceConfig = { ...DEFAULT_CONFIG };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// In-process TTL cache. The middleware calls getMaintenanceConfig() on every
// document/RSC request, and outside Vercel the Edge Config client is a real
// HTTPS request to api.vercel.com — putting an external round-trip on the
// critical path of every navigation. 30s of staleness is fine for a
// maintenance toggle (Edge Config propagation has similar lag, and the
// client-side maintenanceConfig check is a second safety net).
const READ_TTL_MS = 30_000;
let _readCache: { value: MaintenanceConfig; at: number } | null = null;

/**
 * Read the current maintenance configuration.
 * Cached in-process for 30s; instant in dev (memory).
 */
export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const client = getEdgeClient();
  if (client) {
    if (_readCache && Date.now() - _readCache.at < READ_TTL_MS) {
      return _readCache.value;
    }
    try {
      const config = await client.get<MaintenanceConfig>(EDGE_CONFIG_KEY);
      const value = config ?? { ...DEFAULT_CONFIG };
      _readCache = { value, at: Date.now() };
      return value;
    } catch (err) {
      console.warn('[maintenance-store] Edge Config read failed, using defaults:', err);
      // Don't cache failures as "no maintenance" for the full TTL — retry
      // sooner so a transient Edge Config blip can't mask a real config.
      return { ...DEFAULT_CONFIG };
    }
  }
  // Local fallback
  return { ..._memoryStore };
}

/**
 * Write maintenance configuration.
 * Production: PATCH via Vercel REST API.
 * Local dev: updates in-memory store.
 */
export async function setMaintenanceConfig(config: MaintenanceConfig): Promise<MaintenanceConfig> {
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const vercelToken = process.env.VERCEL_API_TOKEN;

  if (edgeConfigId && vercelToken) {
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              operation: 'upsert',
              key: EDGE_CONFIG_KEY,
              value: config,
            },
          ],
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Edge Config write failed (${res.status}): ${body}`);
    }

    // Bust this process's read cache so the admin sees the change instantly.
    // (Other isolates — e.g. the middleware — converge within READ_TTL_MS.)
    _readCache = { value: config, at: Date.now() };
    return config;
  }

  // Local fallback
  _memoryStore = { ...config };
  return _memoryStore;
}
