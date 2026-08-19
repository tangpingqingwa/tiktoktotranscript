(() => {
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
