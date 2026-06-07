const DB_NAME = "printdh-upload-template";
const STORE_NAME = "sessions";
const DB_VERSION = 1;
const ACTIVE_SESSION_ID = "active";

interface StoredBrowserFile {
  name: string;
  type: string;
  lastModified: number;
  data: Blob;
}

interface StoredUploadTemplateSession {
  id: string;
  active: boolean;
  backgroundFiles: StoredBrowserFile[];
  contentFiles: StoredBrowserFile[];
  sequentialBackgroundImages: boolean;
  fineTuneBackgrounds: boolean;
  backgroundlessContentImageIndexes: number[];
  showPageNumbers: boolean;
  pageNumberPosition: "alternating" | "center";
  contentPadding: number;
  stretchContentImages: boolean;
}

export interface BrowserUploadTemplateSession {
  active: boolean;
  backgroundFiles: File[];
  contentFiles: File[];
  sequentialBackgroundImages: boolean;
  fineTuneBackgrounds: boolean;
  backgroundlessContentImageIndexes: number[];
  showPageNumbers: boolean;
  pageNumberPosition: "alternating" | "center";
  contentPadding: number;
  stretchContentImages: boolean;
}

export async function loadBrowserUploadTemplateSession(): Promise<BrowserUploadTemplateSession | null> {
  assertStorageAvailable();
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const stored = await requestToPromise<StoredUploadTemplateSession | undefined>(store.get(ACTIVE_SESSION_ID));
    await waitForTransaction(transaction);

    if (!stored) {
      return null;
    }

    return {
      active: stored.active === true,
      backgroundFiles: stored.backgroundFiles.map(restoreFile),
      contentFiles: stored.contentFiles.map(restoreFile),
      sequentialBackgroundImages: stored.sequentialBackgroundImages,
      fineTuneBackgrounds: stored.fineTuneBackgrounds,
      backgroundlessContentImageIndexes: stored.backgroundlessContentImageIndexes,
      showPageNumbers: stored.showPageNumbers,
      pageNumberPosition: stored.pageNumberPosition,
      contentPadding: stored.contentPadding,
      stretchContentImages: stored.stretchContentImages,
    };
  } finally {
    db.close();
  }
}

export async function saveBrowserUploadTemplateSession(session: BrowserUploadTemplateSession): Promise<void> {
  assertStorageAvailable();
  const db = await openDatabase();

  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      id: ACTIVE_SESSION_ID,
      active: session.active,
      backgroundFiles: session.backgroundFiles.map(storeFile),
      contentFiles: session.contentFiles.map(storeFile),
      sequentialBackgroundImages: session.sequentialBackgroundImages,
      fineTuneBackgrounds: session.fineTuneBackgrounds,
      backgroundlessContentImageIndexes: session.backgroundlessContentImageIndexes,
      showPageNumbers: session.showPageNumbers,
      pageNumberPosition: session.pageNumberPosition,
      contentPadding: session.contentPadding,
      stretchContentImages: session.stretchContentImages,
    } satisfies StoredUploadTemplateSession);
    await waitForTransaction(transaction);
  } finally {
    db.close();
  }
}

function storeFile(file: File): StoredBrowserFile {
  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    data: file,
  };
}

function restoreFile(stored: StoredBrowserFile) {
  return new File([stored.data], stored.name, {
    type: stored.type,
    lastModified: stored.lastModified,
  });
}

function assertStorageAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("Persistent browser storage is unavailable.");
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Unable to open upload storage."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("Upload storage request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error("Upload storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Upload storage transaction aborted."));
    transaction.oncomplete = () => resolve();
  });
}
