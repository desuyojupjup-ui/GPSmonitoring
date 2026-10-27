import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { db, collection, addDoc, serverTimestamp, ensureAuthenticatedSession } from '../firebase';

const OFFLINE_QUEUE_KEY = 'geostride_offline_queue';

/**
 * Strip undefined properties which cause Firestore addDoc to reject.
 */
function sanitizeData(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = sanitizeData(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

/**
 * Maps queued collection names to the permitted Firestore collections.
 * Consolidates security logs, events, facial verifications, anomalies, and reports into ActivityLogs.
 */
function mapTargetCollection(rawName) {
  if (!rawName) return 'ActivityLogs';
  const lower = String(rawName).trim().toLowerCase();

  if (lower.includes('attendance')) return 'attendance';
  if (lower.includes('assignment')) return 'Assignments';

  // All security logs, facial verifications, delay/incident reports, and anomalies
  // route to ActivityLogs where Firestore permissions and admin dashboards listen.
  return 'ActivityLogs';
}

/**
 * Queue an item locally when offline.
 */
export async function queueOfflineRecord(collectionName, data) {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = existing ? JSON.parse(existing) : [];
    
    // Add unique syncId to prevent duplicates
    const record = {
      syncId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      collectionName,
      data: sanitizeData(data),
      timestamp: Date.now(),
      attempts: 0,
    };

    queue.push(record);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return record;
  } catch (error) {
    console.error('Failed to queue offline record:', error);
    return null;
  }
}

/**
 * Get count of pending offline sync items.
 */
export async function getPendingSyncCount() {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = existing ? JSON.parse(existing) : [];
    return queue.length;
  } catch {
    return 0;
  }
}

/**
 * Clear the offline queue.
 */
export async function clearOfflineQueue() {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    return true;
  } catch (e) {
    console.error('Failed to clear offline queue:', e);
    return false;
  }
}

/**
 * Synchronize all pending offline records to Firebase.
 */
export async function syncOfflineRecords() {
  try {
    // 1. Lenient Network check: Only abort if explicitly disconnected
    try {
      const netState = await Network.getNetworkStateAsync();
      if (netState && netState.isConnected === false) {
        return { synced: 0, remaining: await getPendingSyncCount(), isOffline: true };
      }
    } catch (_) {
      // Continue if network state check is unavailable
    }

    // 2. Ensure authenticated session for Firestore permissions
    await ensureAuthenticatedSession().catch(() => {});

    const existing = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!existing) return { synced: 0, remaining: 0 };
    
    let queue = [];
    try {
      queue = JSON.parse(existing) || [];
    } catch {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
      return { synced: 0, remaining: 0 };
    }
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    let syncedCount = 0;
    const remainingQueue = [];

    for (const item of queue) {
      try {
        const targetCol = mapTargetCollection(item.collectionName);
        const cleanedData = sanitizeData(item.data);

        await addDoc(collection(db, targetCol), {
          ...cleanedData,
          originalCollection: item.collectionName || 'ActivityLogs',
          syncedFromOffline: true,
          offlineTimestamp: item.timestamp || Date.now(),
          timestamp: serverTimestamp(),
        });
        syncedCount++;
      } catch (err) {
        console.warn(`[offlineSync] Failed to push ${item.syncId} to ${item.collectionName}:`, err?.message);
        const attempts = (item.attempts || 0) + 1;
        // If an item has failed 4 times (e.g. permanently malformed payload), drop it so it does not block the user queue forever
        if (attempts < 4) {
          remainingQueue.push({ ...item, attempts });
        } else {
          console.warn(`[offlineSync] Dropping permanently failed item ${item.syncId} after 4 attempts`);
        }
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    return { synced: syncedCount, remaining: remainingQueue.length };
  } catch (error) {
    console.error('Offline sync failed:', error);
    return { synced: 0, remaining: await getPendingSyncCount(), error: error.message };
  }
}
