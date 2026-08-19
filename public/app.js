(() => {
  const LAST5_KEY = "tiktoktotranscript:last5";
  const LAST5_MAX = 5;
  const VIDEO_ID_RE = /^\d{19}$/;

  function cues() {
    return Array.from(document.querySelectorAll(".cue"));
  }

  function cueText(el) {
    return (el.textContent || "").trim();
  }

  function formatTs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function copyPlain(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.resolve();
  }

  function resultPath(videoId, lang) {
    return !lang || lang === "en" ? "/t/" + videoId : "/t/" + videoId + "." + lang;
  }

  function readLast5() {
    try {
      const raw = localStorage.getItem(LAST5_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const out = [];
      const seen = new Set();
      for (const item of parsed) {
        const videoId =
          item && typeof item.videoId === "string" ? item.videoId : "";
        const url = item && typeof item.url === "string" ? item.url : "";
        if (!VIDEO_ID_RE.test(videoId) || seen.has(videoId)) {
          continue;
        }
        seen.add(videoId);
        out.push({
          videoId,
          url: url || "/t/" + videoId,
        });
        if (out.length === LAST5_MAX) {
          break;
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  function writeLast5(items) {
    try {
      localStorage.setItem(LAST5_KEY, JSON.stringify(items.slice(0, LAST5_MAX)));
    } catch {
      // Private mode or quota — history is optional.
    }
  }

  function rememberLast5(videoId) {
    if (!VIDEO_ID_RE.test(videoId)) {
      return;
    }
    const url = "/t/" + videoId;
    const next = [{ videoId, url }, ...readLast5().filter((item) => item.videoId !== videoId)];
    writeLast5(next);
  }

  function renderLast5() {
    const root = document.querySelector("#last-five");
    if (!root) {
      return;
    }
    const list = root.querySelector("ol");
    if (!list) {
      return;
    }
    const items = readLast5();
    if (items.length === 0) {
      root.hidden = true;
      list.replaceChildren();
      return;
    }
    list.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.url;
      a.textContent = "TikTok transcript " + item.videoId;
      li.appendChild(a);
      list.appendChild(li);
    }
    root.hidden = false;
  }

  function rememberOriginals() {
    for (const el of cues()) {
      if (!el.getAttribute("data-original-text")) {
        el.setAttribute("data-original-text", cueText(el));
      }
    }
  }

  function restoreOriginals() {
    for (const el of cues()) {
      const original = el.getAttribute("data-original-text");
      if (original) {
        el.textContent = original;
      }
    }
  }

  async function translateInBrowser(targetLang) {
    const api = globalThis.Translator;
    if (!api || typeof api.create !== "function") {
      return false;
    }
    rememberOriginals();
    const sourceLang =
      document.querySelector(".result")?.getAttribute("data-lang") || "en";
    if (targetLang === sourceLang) {
      restoreOriginals();
      return true;
    }
    const translator = await api.create({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });
    for (const el of cues()) {
      const original = el.getAttribute("data-original-text") || cueText(el);
      el.textContent = await translator.translate(original);
    }
    return true;
  }

  function goToLang(videoId, lang) {
    const next = resultPath(videoId, lang);
    if (next !== location.pathname) {
      location.assign(next);
    }
  }

  const copy = document.querySelector("#copy");
  if (copy) {
    copy.addEventListener("click", () => {
      copyPlain(
        cues()
          .map(cueText)
          .filter(Boolean)
          .join("\n"),
      );
    });
  }

  const copyTs = document.querySelector("#copy-ts");
  if (copyTs) {
    copyTs.addEventListener("click", () => {
      copyPlain(
        cues()
          .map((el) => formatTs(el.getAttribute("data-start-ms")) + " " + cueText(el))
          .join("\n"),
      );
    });
  }

  const langSelect = document.querySelector("#lang");
  if (langSelect instanceof HTMLSelectElement) {
    langSelect.addEventListener("change", () => {
      const videoId =
        langSelect.getAttribute("data-video-id") ||
        document.querySelector(".result")?.getAttribute("data-video-id") ||
        "";
      const lang = langSelect.value;
      if (!VIDEO_ID_RE.test(videoId) || !lang) {
        return;
      }
      translateInBrowser(lang)
        .then((ok) => {
          if (!ok) {
            goToLang(videoId, lang);
          }
        })
        .catch(() => {
          goToLang(videoId, lang);
        });
    });
  }

  const success = document.querySelector(".result[data-state='success']");
  const videoId = success && success.getAttribute("data-video-id");
  if (videoId) {
    rememberLast5(videoId);
  }
  renderLast5();

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const seek = target.closest(".cue, .cue-seek");
    if (!seek) {
      return;
    }
    const ms = Number(seek.getAttribute("data-start-ms"));
    if (!Number.isFinite(ms)) {
      return;
    }
    const iframe = document.querySelector(".tiktok-embed iframe, iframe");
    if (!iframe || !iframe.contentWindow) {
      return;
    }
    try {
      iframe.contentWindow.postMessage({ type: "seekTo", value: ms / 1000 }, "*");
    } catch {
      // Embed may refuse postMessage; ignore.
    }
  });
})();
