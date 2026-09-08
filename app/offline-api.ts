"use client";

const DB_NAME = "folha-rural-offline-v1";
const CACHE_STORE = "api-cache";
const OUTBOX_STORE = "outbox";

const normalizeGetKey = (input: string) => {
  const url = new URL(input, window.location.origin);
  url.searchParams.delete("fresh");
  url.searchParams.sort();
  return `GET:${url.pathname}${url.search}`;
};

type OfflineRecord = {
  key: string;
  url: string;
  body?: string;
  value?: unknown;
  savedAt: string;
  method: "GET" | "POST";
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE))
        database.createObjectStore(CACHE_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(OUTBOX_STORE))
        database.createObjectStore(OUTBOX_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function requestStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const get = (store: string, key: string) =>
  requestStore<OfflineRecord | undefined>(store, "readonly", (items) =>
    items.get(key),
  );
const put = (store: string, record: OfflineRecord) =>
  requestStore<IDBValidKey>(store, "readwrite", (items) => items.put(record));
const remove = (store: string, key: string) =>
  requestStore<undefined>(store, "readwrite", (items) => items.delete(key));
const list = (store: string) =>
  requestStore<OfflineRecord[]>(store, "readonly", (items) => items.getAll());

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

export async function cachedApiFetch(input: string, init?: RequestInit) {
  const method = String(init?.method || "GET").toUpperCase();
  if (method !== "GET") return fetch(input, init);
  const key = normalizeGetKey(input);
  try {
    const response = await fetch(input, init);
    if (response.ok) {
      const value = await response.clone().json();
      await put(CACHE_STORE, {
        key,
        url: input,
        value,
        savedAt: new Date().toISOString(),
        method: "GET",
      }).catch(() => undefined);
    }
    return response;
  } catch (error) {
    const cached = await get(CACHE_STORE, key);
    if (cached) return jsonResponse(cached.value, { headers: { "X-Offline-Cache": "true" } });
    throw error;
  }
}

export async function downloadOfflineData(companyIds: number[]) {
  const month = new Date().toISOString().slice(0, 7);
  const urls = new Set([
    "/api/auth",
    "/api/companies",
    "/api/data",
    "/api/services",
    "/api/hr",
    "/api/unions",
    "/api/tax-tables",
    "/api/inventory",
  ]);
  companyIds.forEach((company) => {
    urls.add(`/api/data?company=${company}`);
    urls.add(`/api/services?company=${company}`);
    urls.add(`/api/inventory?company=${company}`);
    urls.add(`/api/launches?company=${company}&month=${month}`);
  });
  let downloaded = 0;
  const failed: string[] = [];
  for (const url of urls) {
    try {
      const response = await cachedApiFetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      downloaded += 1;
    } catch {
      failed.push(url);
    }
  }
  if (downloaded) {
    localStorage.setItem(
      "folha-rural-offline-download-v1",
      JSON.stringify({ downloadedAt: new Date().toISOString(), downloaded }),
    );
  }
  return { downloaded, failed, downloadedAt: new Date().toISOString() };
}

export async function clearOfflineData() {
  const database = await openDatabase();
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CACHE_STORE, "readwrite");
      const request = transaction.objectStore(CACHE_STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
    "serviceWorker" in navigator
      ? navigator.serviceWorker.ready.then((registration) =>
          registration.active?.postMessage({ type: "CLEAR_OFFLINE_DATA" }),
        )
      : Promise.resolve(),
  ]);
  localStorage.removeItem("folha-rural-offline-download-v1");
}

export async function queueableLaunchFetch(
  input: string,
  body: Record<string, unknown>,
) {
  const serialized = JSON.stringify(body);
  const queueKey = [
    "launch",
    body.companySourceId,
    body.action,
    body.entryDate,
    body.contractId,
    body.serviceId,
  ].join(":");
  const send = () =>
    fetch(input, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
    });
  if (navigator.onLine) {
    try {
      return await send();
    } catch {
      // A fila abaixo preserva somente o apontamento idempotente.
    }
  }
  if (body.action !== "save")
    return jsonResponse(
      { error: "Esta operação precisa de conexão. Nenhuma alteração foi aplicada." },
      { status: 503 },
    );
  await put(OUTBOX_STORE, {
    key: queueKey,
    url: input,
    body: serialized,
    savedAt: new Date().toISOString(),
    method: "POST",
  });
  return jsonResponse({
    ok: true,
    queued: true,
    message: "Apontamento salvo neste dispositivo. Será sincronizado quando a internet voltar.",
  });
}

export async function flushOfflineApiQueue() {
  if (!navigator.onLine) return { sent: 0, pending: (await list(OUTBOX_STORE)).length };
  const pending = await list(OUTBOX_STORE);
  let sent = 0;
  for (const item of pending) {
    const response = await fetch(item.url, {
      method: item.method,
      headers: { "Content-Type": "application/json" },
      body: item.body,
    });
    if (!response.ok) continue;
    await remove(OUTBOX_STORE, item.key);
    sent += 1;
  }
  return { sent, pending: pending.length - sent };
}
