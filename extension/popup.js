const api = globalThis.browser ?? globalThis.chrome;
const usesPromiseApi = Boolean(globalThis.browser);
const appUrlInput = document.querySelector("#app-url");
const pageTitle = document.querySelector("#page-title");
const statusLine = document.querySelector("#status");
const saveBookButton = document.querySelector("#save-book");
const saveAuthorButton = document.querySelector("#save-author");
const saveSearchButton = document.querySelector("#save-search");
const DEFAULT_APP_URL = "http://localhost:3000";

let activeTab = null;

init().catch((error) => {
  const message = error instanceof Error ? error.message : "Extension failed to start.";
  setStatus(message, "error");
});

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
  if (detectedSection === "searches") {
    saveSearchButton.focus();
  } else if (detectedSection === "authors") {
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
saveSearchButton.addEventListener("click", () => saveCurrentTab("searches"));

async function saveCurrentTab(section) {
  if (!activeTab?.url) {
    setStatus("No active tab URL found.", "error");
    return;
  }

  setBusy(true);
  setStatus("Saving...", "");

  try {
    const pageData = await getPageData();
    const coverImageData = section === "books" ? await compressCoverImage(pageData.coverImageUrl || "") : "";
    const endpoint = `${normalizeAppUrl(appUrlInput.value)}/api/niches`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section,
        value: activeTab.url,
        title: pageData.title || activeTab.title || "",
        authorName: pageData.authorName || "",
        coverImageData,
        coverImageUrl: pageData.coverImageUrl || "",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Save failed with status ${response.status}`);
    }
    const label = sectionStatusLabel(section);
    if (payload.duplicate) {
      setStatus(`${label} already saved.`, "ok");
    } else {
      setStatus(`${label} saved.`, "ok");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed.";
    setStatus(`${message} Make sure the Next app is running.`, "error");
  } finally {
    setBusy(false);
  }
}

async function compressCoverImage(imageUrl) {
  if (!/^https?:\/\//i.test(imageUrl)) {
    return "";
  }
  try {
    const response = await fetch(imageUrl, { cache: "force-cache" });
    if (!response.ok) {
      return "";
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 5_000_000) {
      return "";
    }

    const bitmap = await loadImage(blob);
    const maxWidth = 180;
    const maxHeight = 240;
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return "";
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const webp = canvas.toDataURL("image/webp", 0.42);
    if (webp.startsWith("data:image/webp")) {
      return webp;
    }
    return canvas.toDataURL("image/jpeg", 0.45);
  } catch {
    return "";
  }
}

async function loadImage(blob) {
  if ("createImageBitmap" in globalThis) {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to load cover image."));
    };
    image.src = objectUrl;
  });
}

async function getPageData() {
  try {
    const results = await executeScript({
      target: { tabId: activeTab.id },
      func: collectAmazonPageData,
    });
    return results?.[0]?.result ?? {};
  } catch {
    return {};
  }
}

function executeScript(details) {
  return callExtensionApi(api.scripting?.executeScript, api.scripting, [details]);
}

function collectAmazonPageData() {
  const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
  const attr = (selector, attribute) => document.querySelector(selector)?.getAttribute(attribute) || "";
  const fieldValue = (selector) => document.querySelector(selector)?.value?.replace(/\s+/g, " ").trim() || "";
  const wrapperCoverImage = document.querySelector("#imgTagWrapperId img");
  const coverImage =
    wrapperCoverImage ||
    document.querySelector("#landingImage, #imgBlkFront, #ebooksImgBlkFront, img[data-a-dynamic-image]");
  const title =
    text("#productTitle") ||
    searchPageTitle() ||
    text("h1[data-testid='title']") ||
    document.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    document.title ||
    "";
  const authorName =
    text("#bylineInfo .author a") ||
    text("#bylineInfo a.a-link-normal") ||
    text("#bylineInfo") ||
    text("#authorFollowHeading") ||
    document.querySelector("meta[name='author']")?.getAttribute("content") ||
    "";
  const coverImageUrl =
    imageSrc(wrapperCoverImage) ||
    bestImageFromElement(coverImage) ||
    attr("#imgTagWrapperId img", "src") ||
    attr("#imgTagWrapperId img", "data-old-hires") ||
    attr("#landingImage", "data-old-hires") ||
    attr("#landingImage", "src") ||
    attr("#imgBlkFront", "data-old-hires") ||
    attr("#imgBlkFront", "src") ||
    attr("#ebooksImgBlkFront", "src") ||
    document.querySelector("meta[property='og:image']")?.getAttribute("content") ||
    "";

  return {
    authorName: authorName.replace(/^by\s+/i, "").trim(),
    coverImageUrl,
    title: title.replace(/\s*:\s*Amazon\.[^:]+$/i, "").trim(),
  };

  function searchPageTitle() {
    const query =
      fieldValue("#twotabsearchtextbox") ||
      new URLSearchParams(window.location.search).get("k") ||
      new URLSearchParams(window.location.search).get("field-keywords") ||
      "";
    return query.trim() ? `Amazon search: ${query.trim()}` : "";
  }

  function bestImageFromElement(image) {
    if (!image) {
      return "";
    }
    return (
      toAbsoluteImageUrl(largestDynamicImage(image.getAttribute("data-a-dynamic-image") || "")) ||
      toAbsoluteImageUrl(image.getAttribute("data-old-hires") || "") ||
      toAbsoluteImageUrl(largestSrcSet(image.getAttribute("srcset") || "")) ||
      toAbsoluteImageUrl(image.currentSrc || "") ||
      toAbsoluteImageUrl(image.getAttribute("src") || "") ||
      ""
    );
  }

  function imageSrc(image) {
    if (!image) {
      return "";
    }
    return toAbsoluteImageUrl(image.getAttribute("src") || image.currentSrc || image.getAttribute("data-old-hires") || "");
  }

  function toAbsoluteImageUrl(value) {
    if (!value) {
      return "";
    }
    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return value;
    }
  }

  function largestDynamicImage(value) {
    if (!value) {
      return "";
    }
    try {
      return Object.entries(JSON.parse(value)).reduce(
        (best, [url, dimensions]) => {
          const [width, height] = Array.isArray(dimensions) ? dimensions : [];
          const score = Number(width || 0) * Number(height || 0);
          return score > best.score ? { score, url } : best;
        },
        { score: 0, url: "" }
      ).url;
    } catch {
      return "";
    }
  }

  function largestSrcSet(value) {
    if (!value) {
      return "";
    }
    return (
      value
        .split(",")
        .map((item) => {
          const [url = "", descriptor = ""] = item.trim().split(/\s+/, 2);
          const score = Number(descriptor.replace(/[^\d.]/g, "")) || 0;
          return { score, url };
        })
        .filter((item) => item.url)
        .sort((left, right) => right.score - left.score)[0]?.url || ""
    );
  }
}

function detectSection(url) {
  if (isAmazonSearchUrl(url)) {
    return "searches";
  }
  if (/\/(author|stores\/author)\//i.test(url)) {
    return "authors";
  }
  return "books";
}

function isAmazonSearchUrl(url) {
  try {
    const parsed = new URL(url);
    return /(^|\.)amazon\./i.test(parsed.hostname) && parsed.pathname.replace(/\/+$/, "") === "/s";
  } catch {
    return false;
  }
}

function sectionStatusLabel(section) {
  if (section === "authors") {
    return "Author";
  }
  if (section === "searches") {
    return "Search page";
  }
  return "Book";
}

function normalizeAppUrl(value) {
  return (value || DEFAULT_APP_URL).trim().replace(/\/+$/, "") || DEFAULT_APP_URL;
}

function getActiveTab() {
  return callExtensionApi(api.tabs?.query, api.tabs, [{ active: true, currentWindow: true }])
    .then((tabs) => tabs?.[0] ?? null)
    .catch(() => null);
}

function storageGet(key) {
  return callExtensionApi(api.storage?.local?.get, api.storage?.local, [key])
    .then((items) => items?.[key])
    .catch(() => undefined);
}

function storageSet(key, value) {
  return callExtensionApi(api.storage?.local?.set, api.storage?.local, [{ [key]: value }]).catch(() => undefined);
}

function callExtensionApi(method, context, args) {
  if (!method || !context) {
    return Promise.reject(new Error("Required browser extension API is unavailable."));
  }

  if (usesPromiseApi) {
    return method.apply(context, args);
  }

  return new Promise((resolve, reject) => {
    try {
      const result = method.apply(context, [
        ...args,
        (value) => {
          const error = api.runtime?.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(value);
        },
      ]);
      if (result && typeof result.then === "function") {
        result.then(resolve).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function setBusy(isBusy) {
  saveBookButton.disabled = isBusy;
  saveAuthorButton.disabled = isBusy;
  saveSearchButton.disabled = isBusy;
}

function setStatus(message, state) {
  statusLine.textContent = message;
  statusLine.dataset.state = state;
}
