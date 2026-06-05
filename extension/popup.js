const api = globalThis.chrome ?? globalThis.browser;
const appUrlInput = document.querySelector("#app-url");
const pageTitle = document.querySelector("#page-title");
const statusLine = document.querySelector("#status");
const saveBookButton = document.querySelector("#save-book");
const saveAuthorButton = document.querySelector("#save-author");
const DEFAULT_APP_URL = "http://localhost:3000";

let activeTab = null;

init();

async function init() {
  const savedUrl = await storageGet("appUrl");
  appUrlInput.value = savedUrl || DEFAULT_APP_URL;
  activeTab = await getActiveTab();

  if (!activeTab?.url) {
    setStatus("Unable to read the active tab.", "error");
    return;
  }

  pageTitle.textContent = activeTab.title || activeTab.url;
  const detectedSection = detectSection(activeTab.url);
  if (detectedSection === "authors") {
    saveAuthorButton.focus();
  } else {
    saveBookButton.focus();
  }
}

appUrlInput.addEventListener("change", () => {
  const appUrl = normalizeAppUrl(appUrlInput.value);
  appUrlInput.value = appUrl;
  storageSet("appUrl", appUrl);
});

saveBookButton.addEventListener("click", () => saveCurrentTab("books"));
saveAuthorButton.addEventListener("click", () => saveCurrentTab("authors"));

async function saveCurrentTab(section) {
  if (!activeTab?.url) {
    setStatus("No active tab URL found.", "error");
    return;
  }

  setBusy(true);
  setStatus("Saving...", "");

  try {
    const endpoint = `${normalizeAppUrl(appUrlInput.value)}/api/niches`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section,
        value: activeTab.url,
        title: activeTab.title || "",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Save failed with status ${response.status}`);
    }
    setStatus(section === "books" ? "Book saved." : "Author saved.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed.";
    setStatus(`${message} Make sure the Next app is running.`, "error");
  } finally {
    setBusy(false);
  }
}

function detectSection(url) {
  if (/\/(author|stores\/author)\//i.test(url)) {
    return "authors";
  }
  return "books";
}

function normalizeAppUrl(value) {
  return (value || DEFAULT_APP_URL).trim().replace(/\/+$/, "") || DEFAULT_APP_URL;
}

function getActiveTab() {
  return new Promise((resolve) => {
    const result = api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0] ?? null);
    });
    if (result && typeof result.then === "function") {
      result.then((tabs) => resolve(tabs?.[0] ?? null)).catch(() => resolve(null));
    }
  });
}

function storageGet(key) {
  return new Promise((resolve) => {
    const result = api.storage.local.get(key, (items) => resolve(items?.[key]));
    if (result && typeof result.then === "function") {
      result.then((items) => resolve(items?.[key])).catch(() => resolve(undefined));
    }
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    const result = api.storage.local.set({ [key]: value }, resolve);
    if (result && typeof result.then === "function") {
      result.then(resolve).catch(resolve);
    }
  });
}

function setBusy(isBusy) {
  saveBookButton.disabled = isBusy;
  saveAuthorButton.disabled = isBusy;
}

function setStatus(message, state) {
  statusLine.textContent = message;
  statusLine.dataset.state = state;
}
