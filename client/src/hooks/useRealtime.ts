import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { EntryKind, ServerEvent } from '../../../shared/types';
import { API_BASE, CLIENT_ID, apiFetch } from '../lib/apiFetch';
import { keys } from '../lib/keys';
import { taskCountsKey } from '../features/projects/api';

/**
 * Keeps this device in step with changes made elsewhere (phone ↔ desktop) via Server-Sent Events.
 * Events from this tab are ignored. After a dropped connection everything visible is refreshed,
 * since events may have been missed.
 */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let hadError = false;

    const handle = (event: ServerEvent) => {
      if (event.origin === CLIENT_ID) return;
      switch (event.entity) {
        case 'journal':
        case 'writing':
        case 'note': {
          const kind: EntryKind = event.entity;
          void qc.invalidateQueries({ queryKey: keys.entries(kind) });
          void qc.invalidateQueries({ queryKey: keys.home });
          if (event.id) void qc.invalidateQueries({ queryKey: keys.entry(kind, event.id) });
          break;
        }
        case 'task':
          void qc.invalidateQueries({ queryKey: keys.tasks });
          void qc.invalidateQueries({ queryKey: taskCountsKey });
          if (event.id) void qc.invalidateQueries({ queryKey: ['task', event.id] });
          break;
        case 'project':
          void qc.invalidateQueries({ queryKey: ['projects'] });
          void qc.invalidateQueries({ queryKey: keys.home });
          if (event.id) void qc.invalidateQueries({ queryKey: ['project', event.id] });
          break;
        case 'book':
          void qc.invalidateQueries({ queryKey: ['books'] });
          void qc.invalidateQueries({ queryKey: keys.home });
          if (event.id) void qc.invalidateQueries({ queryKey: ['book', event.id] });
          break;
        case 'document':
          void qc.invalidateQueries({ queryKey: ['documents'] });
          void qc.invalidateQueries({ queryKey: keys.home });
          if (event.id) void qc.invalidateQueries({ queryKey: ['document', event.id] });
          break;
        case 'income':
          void qc.invalidateQueries({ queryKey: ['income'] });
          break;
        case 'link':
          void qc.invalidateQueries({ queryKey: ['links'] });
          break;
        case 'expense':
        case 'subscription':
          void qc.invalidateQueries({ queryKey: ['expenses'] });
          void qc.invalidateQueries({ queryKey: ['subscriptions'] });
          break;
        case 'moneyIdea':
          void qc.invalidateQueries({ queryKey: ['moneyIdeas'] });
          if (event.id) void qc.invalidateQueries({ queryKey: ['moneyIdea', event.id] });
          break;
        case 'review':
          void qc.invalidateQueries({ queryKey: ['reviews'] });
          break;
        case 'moment':
          void qc.invalidateQueries({ queryKey: ['moments'] });
          break;
        case 'vault':
          void qc.invalidateQueries({ queryKey: ['vault'] });
          break;
        case 'inbox':
          void qc.invalidateQueries({ queryKey: keys.inbox });
          void qc.invalidateQueries({ queryKey: keys.home });
          break;
        case 'prefs':
          void qc.invalidateQueries({ queryKey: keys.prefs });
          break;
      }
    };

    const connect = () => {
      source = new EventSource(`${API_BASE}/events`, { withCredentials: true });
      source.onopen = () => {
        if (hadError) void qc.invalidateQueries({ type: 'active' });
        hadError = false;
      };
      source.onmessage = (msg) => {
        try {
          handle(JSON.parse(msg.data as string) as ServerEvent);
        } catch {
          // ignore malformed events
        }
      };
      source.onerror = () => {
        hadError = true;
        if (source?.readyState !== EventSource.CLOSED) return; // browser is reconnecting itself
        source.close();
        // Usually an expired access token: touching the API refreshes it, then reconnect.
        retry = setTimeout(async () => {
          if (stopped) return;
          await apiFetch('/auth/me').catch(() => undefined);
          if (!stopped) connect();
        }, 3000);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [enabled, qc]);
}
