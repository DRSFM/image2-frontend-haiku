/* Image2 Studio v0.8 frontend — pure vanilla JS, same-origin only. */
(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    prompt: $("prompt"),
    charCount: $("char-count"),
    size: $("size"),
    quality: $("quality"),
    format: $("format"),
    batch: $("batch"),
    savePath: $("save-path"),
    btnGenerate: $("btn-generate"),
    btnCopy: $("btn-copy"),
    btnClear: $("btn-clear"),
    btnOptimize: $("btn-optimize"),
    btnOpenFolder: $("btn-open-folder"),
    btnOpenFolderInline: $("btn-open-folder-inline"),
    btnRefresh: $("btn-refresh-history"),
    btnOpenImage: $("btn-open-image"),
    btnPreviewMore: $("btn-preview-more"),
    btnTheme: $("btn-theme"),
    btnTerm: $("btn-term"),
    btnUser: $("btn-user"),
    themeIco: $("theme-ico"),
    histPrev: $("hist-prev"),
    histNext: $("hist-next"),
    previewFrame: $("preview-frame"),
    metaFilename: $("meta-filename"),
    metaDim: $("meta-dim"),
    metaTime: $("meta-time"),
    metaState: $("meta-state"),
    metaStatePill: $("meta-state-pill"),
    historyStrip: $("history-strip"),
    hint: $("generate-hint"),
    statusCard: $("status-card"),
    statusDot: $("status-dot"),
    statusSub: $("status-sub"),
    backendMenu: $("backend-menu"),
    optShutdownBackend: $("opt-shutdown-backend"),
    optAutoOptimize: $("opt-auto-optimize"),
    refCard: $("ref-card"),
    modeBtns: document.querySelectorAll(".mode-btn"),
    backendDot: $("backend-dot"),
    backendText: $("backend-text"),
    versionLabel: $("version-label"),
    toast: $("toast"),
    dropzone: $("dropzone"),
    refFile: $("ref-file"),
    dzEmpty: $("dropzone-empty"),
    dzPreview: $("dropzone-preview"),
    refThumb: $("ref-thumb"),
    refName: $("ref-name"),
    refSize: $("ref-size"),
    btnRemoveRef: $("btn-remove-ref"),
    btnGenerateLabel: document.querySelector("#btn-generate span"),
    saveTarget: $("save-target"),
    saveTargetHint: $("save-target-hint"),
    saveTargetBtns: document.querySelectorAll(".save-target-btn"),
    hostedMode: $("hosted-mode"),
    stHostedMode: $("st-hosted-mode"),
    hostedModeHint: $("hosted-mode-hint"),
    stHostedModeHint: $("st-hosted-mode-hint"),
  };

  const MAX_REF_BYTES = 20 * 1024 * 1024;
  const REF_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
  let lastImageUrl = null;
  let toastTimer = null;
  let refFile = null;        // currently selected reference image (File)
  let refObjectUrl = null;   // blob URL for the thumbnail preview
  let mode = "text";         // "text" | "edit"
  let autoOptimize = false;  // mirrored from settings
  let saveTarget = "pc";     // "pc" | "phone" | "both"
  let hostedMode = false;    // submit text-to-image work to the PC backend
  let hostedPollTimer = null;
  const SAVE_TARGET_KEY = "image2.saveTarget";
  const HOSTED_MODE_KEY = "image2.hostedMode";
  const ACTIVE_TASK_KEY = "image2.activeTaskId";
  const SAVE_TARGET_HINTS = {
    pc:    "写入电脑保存目录，不触发手机下载。",
    phone: "不写入电脑磁盘；图片直接由浏览器下载到当前设备（手机相册 / 下载目录）。",
    both:  "写入电脑保存目录，同时由浏览器下载到当前设备。",
  };

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  function fmtClock(ts) {
    const d = new Date(ts * 1000);
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function fillSelect(sel, options, def) {
    sel.innerHTML = "";
    for (const v of options) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      if (v === def) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function setBackend(state, text) {
    els.backendDot.classList.remove("ok", "warn", "bad");
    els.statusDot.classList.remove("ok", "warn", "bad");
    if (state === "ok")     { els.backendDot.classList.add("ok");   els.statusDot.classList.add("ok"); }
    else if (state === "warn") { els.backendDot.classList.add("warn"); els.statusDot.classList.add("warn"); }
    else                    { els.backendDot.classList.add("bad");  els.statusDot.classList.add("bad"); }
    els.backendText.textContent = text;
  }

  let userPrefs = null;
  async function loadStatus() {
    try {
      const [j, s] = await Promise.all([
        fetch("/api/status").then(r => r.json()),
        userPrefs ? Promise.resolve(userPrefs) : fetch("/api/settings").then(r => r.json()).catch(() => ({})),
      ]);
      if (!userPrefs) userPrefs = s;
      // populate selects only on first load (preserve user choice afterwards)
      if (!els.size.options.length) fillSelect(els.size, j.allowed_sizes, s.default_size || "2160x3840");
      if (!els.quality.options.length) fillSelect(els.quality, j.allowed_quality, s.default_quality || "high");
      if (!els.format.options.length) fillSelect(els.format, j.allowed_formats, s.default_format || "png");
      if (!els.batch.dataset.seeded) { els.batch.value = s.default_n || 1; els.batch.dataset.seeded = "1"; }
      els.savePath.value = j.save_dir || "";
      els.versionLabel.textContent = "v" + (j.version || "0.6");

      if (j.backend_state === "ok" && j.credential_loaded) {
        setBackend("ok", "Backend Connected");
        els.statusSub.textContent = "Backend Connected";
      } else if (j.backend_state === "stalled") {
        setBackend("warn", "Backend 无响应");
        els.statusSub.textContent = j.backend_detail || "请重启 Backend";
      } else if (j.backend_state === "down") {
        setBackend("bad", "Backend 未启动");
        els.statusSub.textContent = "请先启动 Backend 服务";
      } else if (!j.credential_loaded) {
        setBackend("bad", "凭据未加载");
        els.statusSub.textContent = j.credential_error || "凭据配置读取失败";
      }
    } catch (e) {
      setBackend("bad", "本地服务异常");
      els.statusSub.textContent = "前后端断开";
    }
  }

  function appendThumb(it) {
    const card = document.createElement("div");
    card.className = "thumb";
    card.title = it.filename;
    card.innerHTML = `
      <img class="thumb-img" loading="lazy" src="${it.url}" alt="">
      <div class="thumb-meta">
        <div class="thumb-name">${it.filename}</div>
        <div class="thumb-sub">
          <span>${fmtClock(it.mtime)}</span>
          <span>·</span>
          <span>${it.width}×${it.height}</span>
          <svg><use href="#i-check"/></svg>
        </div>
      </div>`;
    card.addEventListener("click", () => {
      renderPreview({
        url: it.url,
        filename: it.filename,
        width: it.width,
        height: it.height,
        elapsed_ms: null,
        saved: true,
      });
    });
    els.historyStrip.appendChild(card);
  }

  async function loadHistory() {
    try {
      const r = await fetch("/api/history");
      const j = await r.json();
      els.historyStrip.innerHTML = "";
      for (const it of j.items) appendThumb(it);
      if (!j.items.length) {
        els.historyStrip.innerHTML =
          '<div style="color:var(--text-mute);font-size:13px;padding:8px;">暂无历史</div>';
      }
    } catch (e) {}
  }

  let lastFilename = null;
  function renderPreview(info) {
    lastImageUrl = info.url;
    lastFilename = info.filename;
    els.previewFrame.classList.remove("loading");
    els.previewFrame.innerHTML = `<img src="${info.url}" alt="${info.filename}">`;
    els.metaFilename.textContent = info.filename;
    els.metaDim.textContent = `${info.width} × ${info.height}`;
    els.metaTime.textContent = info.elapsed_ms != null
      ? `${(info.elapsed_ms / 1000).toFixed(1)}s`
      : "—";
    els.metaState.textContent = info.saved ? "保存成功" : "完成";
    els.metaStatePill.classList.add("ok-pill");
  }

  function setActiveTaskId(taskId) {
    try {
      if (taskId) localStorage.setItem(ACTIVE_TASK_KEY, taskId);
      else localStorage.removeItem(ACTIVE_TASK_KEY);
    } catch {}
  }

  function setHostedMode(on) {
    hostedMode = !!on;
    if (els.hostedMode) els.hostedMode.checked = hostedMode;
    if (els.stHostedMode) els.stHostedMode.checked = hostedMode;
    const textModeHint = hostedMode
      ? "后台生成并写入电脑图库，手机回来后自动同步。"
      : "关闭后沿用当前页面等待返回的生成方式。";
    const editModeHint = "图生图暂走直接生成；托管先用于文生图。";
    const workbenchHint = mode === "edit" && hostedMode ? editModeHint : textModeHint;
    if (els.hostedModeHint) {
      els.hostedModeHint.textContent = workbenchHint;
      els.hostedModeHint.classList.toggle("warn", hostedMode && mode === "edit");
    }
    if (els.stHostedModeHint) {
      els.stHostedModeHint.textContent = hostedMode
        ? "手机提交文生图后可以切后台或锁屏，电脑端继续生成。"
        : "关闭后手机端生成时需要停留在页面等待返回。";
    }
    try { localStorage.setItem(HOSTED_MODE_KEY, hostedMode ? "1" : "0"); } catch {}
  }

  function renderHostedWaiting(task) {
    const request = (task && task.request) || {};
    const n = request.n || 1;
    const state = task && task.status === "running" ? "运行中" : "排队中";
    els.previewFrame.classList.add("loading");
    els.previewFrame.innerHTML = `<div class="preview-empty">任务已托管到电脑后台 · ${state}</div>`;
    els.metaFilename.textContent = task && task.id ? `task:${String(task.id).slice(0, 8)}` : "托管任务";
    els.metaDim.textContent = request.size || "—";
    els.metaTime.textContent = "—";
    els.metaState.textContent = n > 1 ? `托管中 (${n} 张)` : "托管中";
    els.metaStatePill.classList.remove("ok-pill");
    els.hint.className = "hint ok";
    els.hint.textContent = "任务已交给电脑后台处理，手机可以切后台或锁屏。";
  }

  function renderHostedError(task) {
    const payload = (task && task.error) || { error: "托管任务失败" };
    const box = document.createElement("div");
    box.className = "preview-empty error-detail";
    box.textContent = `托管生成失败：\n${formatApiError(payload, payload.upstream_status || 500)}`;
    els.previewFrame.classList.remove("loading");
    els.previewFrame.replaceChildren(box);
    els.metaState.textContent = "失败";
    els.metaStatePill.classList.remove("ok-pill");
    els.hint.className = "hint err";
    els.hint.textContent = "托管任务失败，错误已从电脑端同步。";
  }

  function renderHostedResult(task) {
    const result = (task && task.result) || {};
    const items = result.items || [];
    const head = items[0] || result;
    if (head && head.url) {
      renderPreview({
        url: head.url,
        filename: head.filename || result.filename,
        width: head.width || result.width,
        height: head.height || result.height,
        elapsed_ms: result.elapsed_ms,
        saved: true,
      });
    }
    const count = items.length || 1;
    els.hint.className = "hint ok";
    els.hint.textContent = count > 1 ? `托管完成：${count} 张已同步到图库` : "托管完成：已同步到图库";
    loadHistory();
    loadGallery();
  }

  async function pollHostedTask(taskId) {
    if (!taskId) return;
    clearTimeout(hostedPollTimer);
    try {
      const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 404) {
          setActiveTaskId(null);
          els.hint.className = "hint err";
          els.hint.textContent = "托管任务不存在，已停止恢复轮询。";
          return;
        }
        throw new Error(formatApiError(j, r.status));
      }
      const task = j.task || {};
      if (task.status === "succeeded") {
        setActiveTaskId(null);
        renderHostedResult(task);
        showToast("托管任务已完成");
        return;
      }
      if (task.status === "failed" || task.status === "canceled") {
        setActiveTaskId(null);
        renderHostedError(task);
        return;
      }
      renderHostedWaiting(task);
      hostedPollTimer = setTimeout(() => pollHostedTask(taskId), 3000);
    } catch (e) {
      els.hint.className = "hint err";
      els.hint.textContent = `托管状态同步失败：${e.message}`;
      hostedPollTimer = setTimeout(() => pollHostedTask(taskId), 6000);
    }
  }

  function resumeHostedTask() {
    let taskId = "";
    try { taskId = localStorage.getItem(ACTIVE_TASK_KEY) || ""; } catch {}
    if (taskId) pollHostedTask(taskId);
  }

  function formatApiError(payload, fallbackStatus) {
    if (!payload || typeof payload !== "object") {
      return `HTTP ${fallbackStatus}`;
    }
    const lines = [];
    const status = payload.upstream_status || fallbackStatus;
    const reason = payload.upstream_reason ? ` ${payload.upstream_reason}` : "";
    lines.push(`HTTP ${status}${reason}`);
    if (payload.upstream_error_type) lines.push(`type: ${payload.upstream_error_type}`);
    if (payload.upstream_error_code) lines.push(`code: ${payload.upstream_error_code}`);
    if (payload.upstream_message || payload.error) {
      lines.push(`message: ${payload.upstream_message || payload.error}`);
    }
    if (payload.detail && !String(payload.detail).includes(payload.upstream_message || payload.error || "")) {
      lines.push(`detail: ${payload.detail}`);
    }
    if (payload.elapsed_ms != null) {
      lines.push(`elapsed: ${(payload.elapsed_ms / 1000).toFixed(1)}s`);
    }
    return lines.join("\n");
  }

  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  }

  function clearRefImage() {
    refFile = null;
    if (refObjectUrl) {
      URL.revokeObjectURL(refObjectUrl);
      refObjectUrl = null;
    }
    els.refFile.value = "";
    els.dzEmpty.hidden = false;
    els.dzPreview.hidden = true;
    els.refThumb.removeAttribute("src");
    els.dropzone.classList.remove("filled");
    updateGenerateLabel();
  }

  function setRefImage(file) {
    if (!file) return;
    if (!REF_MIMES.has(file.type)) {
      showToast("仅支持 PNG / JPEG / WebP");
      return;
    }
    if (file.size > MAX_REF_BYTES) {
      showToast(`图片超过 20 MB（当前 ${fmtBytes(file.size)}）`);
      return;
    }
    refFile = file;
    if (refObjectUrl) URL.revokeObjectURL(refObjectUrl);
    refObjectUrl = URL.createObjectURL(file);
    els.refThumb.src = refObjectUrl;
    els.refName.textContent = file.name;
    els.refSize.textContent = `${fmtBytes(file.size)} · ${file.type.replace("image/", "").toUpperCase()}`;
    els.dzEmpty.hidden = true;
    els.dzPreview.hidden = false;
    els.dropzone.classList.add("filled");
    updateGenerateLabel();
  }

  function updateGenerateLabel() {
    if (!els.btnGenerateLabel) return;
    els.btnGenerateLabel.textContent = mode === "edit" ? "图生图" : "生成图片";
  }

  function setMode(next) {
    if (next !== "text" && next !== "edit") return;
    mode = next;
    for (const b of els.modeBtns) {
      const active = b.dataset.mode === next;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    }
    if (next === "text") {
      els.refCard.hidden = true;
      // dropping the file keeps the state machine consistent
      if (refFile) clearRefImage();
      els.batch.disabled = false;
    } else {
      els.refCard.hidden = false;
      // The edit endpoint returns one image per call regardless of n
      els.batch.disabled = true;
    }
    setHostedMode(hostedMode);
    updateGenerateLabel();
  }

  function looksLikeModeration(payload) {
    if (!payload || typeof payload !== "object") return false;
    const msg = String(payload.upstream_message || payload.error || "");
    const code = String(payload.upstream_error_code || "");
    return /stream disconnected before completion/i.test(msg)
      || code === "internal_server_error" && /disconnected/i.test(msg);
  }

  async function optimizePrompt(text) {
    const r = await fetch("/api/optimize-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text }),
    });
    const raw = await r.text();
    let j;
    try { j = raw ? JSON.parse(raw) : {}; } catch { j = { error: raw }; }
    if (!r.ok) throw new Error(formatApiError(j, r.status));
    return j.optimized_prompt || "";
  }

  async function generate() {
    let prompt = els.prompt.value.trim();
    if (!prompt) {
      els.hint.textContent = "请输入 Prompt";
      els.hint.className = "hint err";
      return;
    }
    const isEdit = mode === "edit";
    if (isEdit && !refFile) {
      els.hint.textContent = "图生图模式下需要先上传参考图";
      els.hint.className = "hint err";
      return;
    }
    const n = isEdit ? 1 : Math.max(1, Math.min(4, parseInt(els.batch.value || "1", 10) || 1));
    els.btnGenerate.disabled = true;
    els.hint.className = "hint";

    // Auto-optimize: rewrite the prompt before submission so the upstream
    // moderation filter is less likely to silently kill the stream.
    if (autoOptimize) {
      els.hint.textContent = "正在优化 Prompt…";
      try {
        const optimized = await optimizePrompt(prompt);
        if (optimized && optimized !== prompt) {
          prompt = optimized;
          els.prompt.value = optimized;
          els.charCount.textContent = optimized.length;
        }
      } catch (e) {
        // Optimize failure is non-fatal — just warn and continue with original.
        showToast(`Prompt 优化失败，使用原文：${e.message}`);
      }
    }

    els.hint.textContent = isEdit
      ? "图生图中…首次调用可能耗时较长，请勿关闭窗口。"
      : `生成中…(${n} 张) 首张可能需要几十秒，请勿关闭窗口。`;
    els.previewFrame.classList.add("loading");
    els.previewFrame.innerHTML = `<div class="preview-empty">${
      isEdit ? "正在基于参考图调用 gpt-image-2…" : "正在调用本地 gpt-image-2…"
    }</div>`;
    els.metaState.textContent = isEdit ? "编辑中…" : "生成中…";
    els.metaStatePill.classList.remove("ok-pill");

    const targetNow  = saveTarget;          // freeze for this request
    const writeDisk  = targetNow !== "phone";
    const wantB64    = targetNow !== "pc";
    const hostedNow  = hostedMode && !isEdit;

    let lastErrorPayload = null;
    try {
      if (hostedNow) {
        els.hint.textContent = "正在提交托管任务…";
        const resp = await fetch("/api/tasks/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            size: els.size.value,
            quality: els.quality.value,
            output_format: els.format.value,
            n,
            save_to_disk: true,
            include_b64: false,
          }),
        });
        const raw = await resp.text();
        let j;
        try {
          j = raw ? JSON.parse(raw) : {};
        } catch {
          j = { error: raw || `HTTP ${resp.status}`, detail: raw };
        }
        if (!resp.ok) {
          lastErrorPayload = j;
          throw new Error(formatApiError(j, resp.status));
        }
        const task = j.task || {};
        const taskId = j.task_id || task.id;
        if (!taskId) throw new Error("后台未返回 task_id");
        setActiveTaskId(taskId);
        renderHostedWaiting({ ...task, id: taskId, request: { size: els.size.value, n } });
        pollHostedTask(taskId);
        return;
      }

      let resp;
      if (isEdit) {
        const fd = new FormData();
        fd.append("prompt", prompt);
        fd.append("size", els.size.value);
        fd.append("quality", els.quality.value);
        fd.append("output_format", els.format.value);
        fd.append("image", refFile, refFile.name);
        fd.append("save_to_disk", writeDisk ? "1" : "0");
        fd.append("include_b64",  wantB64   ? "1" : "0");
        resp = await fetch("/api/edit", { method: "POST", body: fd });
      } else {
        resp = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            size: els.size.value,
            quality: els.quality.value,
            output_format: els.format.value,
            n,
            save_to_disk: writeDisk,
            include_b64: wantB64,
          }),
        });
      }
      const raw = await resp.text();
      let j;
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        j = { error: raw || `HTTP ${resp.status}`, detail: raw };
      }
      if (!resp.ok) {
        lastErrorPayload = j;
        throw new Error(formatApiError(j, resp.status));
      }

      const items = j.items || [];
      const head  = items[0] || j;
      // For phone-only mode the server returned no /api/image URL — build a
      // blob URL from the inline b64 so the preview pane still works.
      let previewUrl = head.url || j.url || null;
      let previewBlobUrl = null;
      if (!previewUrl && head.b64_json) {
        const blob = b64ToBlob(head.b64_json, head.mime || "image/png");
        previewBlobUrl = URL.createObjectURL(blob);
        previewUrl = previewBlobUrl;
      }
      renderPreview({
        url: previewUrl,
        filename: head.filename || j.filename,
        width:    head.width    || j.width,
        height:   head.height   || j.height,
        elapsed_ms: j.elapsed_ms,
        saved: writeDisk,
      });

      // Download to the current device when phone-side save is requested.
      if (wantB64) {
        const triggered = downloadItemsToPhone(items.length ? items : [head]);
        if (triggered) showToast(triggered > 1 ? `已触发 ${triggered} 张下载` : "已触发下载");
      }

      els.hint.className = "hint ok";
      const count = items.length || 1;
      const dir = head.saved_to ? head.saved_to.split("\\").slice(0, -1).join("\\") : "";
      let tag;
      if (targetNow === "phone")     tag = isEdit ? "图生图完成 · 已下载到当前设备" : (count > 1 ? `${count} 张已下载到当前设备` : "已下载到当前设备");
      else if (targetNow === "both") tag = isEdit ? "图生图完成 · 电脑+当前设备" : (count > 1 ? `${count} 张：电脑+当前设备` : "已保存：电脑+当前设备");
      else                            tag = isEdit ? "图生图完成" : (count > 1 ? `成功生成 ${count} 张` : "保存成功");
      if (writeDisk) {
        els.hint.textContent = isEdit
          ? `${tag} → ${head.saved_to || dir}`
          : (count > 1 ? `${tag} → ${dir}` : `${tag} → ${head.saved_to || ""}`);
      } else {
        els.hint.textContent = `${tag}（未写入电脑磁盘）`;
      }

      // History strip and gallery only see images that hit disk.
      if (writeDisk) loadHistory();
      // refresh prefs in case user changed auto-open between launches
      try { userPrefs = await fetch("/api/settings").then(r => r.json()); } catch {}
      if (writeDisk && userPrefs && userPrefs.auto_open_folder_on_save) {
        fetch("/api/open-folder", { method: "POST" });
      }
    } catch (e) {
      els.previewFrame.classList.remove("loading");
      const moderation = looksLikeModeration(lastErrorPayload);
      const box = document.createElement("div");
      box.className = "preview-empty " + (moderation ? "warn-detail" : "error-detail");
      if (moderation) {
        box.textContent =
          `⚠️ 上游可能命中内容审核策略（流被静默关闭）。\n` +
          `建议：换一个 prompt / 参考图，或开启「自动优化 Prompt」。\n\n` +
          `原始错误：\n${e.message}`;
        els.hint.className = "hint err";
        els.hint.textContent = "可能被上游内容策略拦截，换个 prompt 或开启自动优化再试";
      } else {
        box.textContent = `${isEdit ? "图生图失败" : "生成失败"}：\n${e.message}`;
        els.hint.className = "hint err";
        els.hint.textContent = `失败：${e.message}`;
      }
      els.previewFrame.replaceChildren(box);
      els.metaState.textContent = "失败";
      els.metaStatePill.classList.remove("ok-pill");
    } finally {
      els.btnGenerate.disabled = false;
    }
  }

  // ---- wiring ----
  els.prompt.addEventListener("input", () => {
    els.charCount.textContent = els.prompt.value.length;
  });
  els.btnClear.addEventListener("click", () => {
    els.prompt.value = ""; els.charCount.textContent = "0";
  });
  els.btnCopy.addEventListener("click", async () => {
    const t = els.prompt.value;
    if (!t) { showToast("Prompt 为空"); return; }
    try { await navigator.clipboard.writeText(t); showToast("已复制 Prompt"); }
    catch { showToast("复制失败"); }
  });
  els.btnOptimize.addEventListener("click", async () => {
    const t = els.prompt.value.trim();
    if (!t) { showToast("Prompt 为空"); return; }
    els.btnOptimize.disabled = true;
    const span = els.btnOptimize.querySelector("span");
    const orig = span ? span.textContent : "";
    if (span) span.textContent = "优化中…";
    try {
      const optimized = await optimizePrompt(t);
      if (!optimized) { showToast("优化器返回空文本"); return; }
      if (optimized === t) { showToast("无需改写"); return; }
      els.prompt.value = optimized;
      els.charCount.textContent = optimized.length;
      showToast("已优化 Prompt");
    } catch (e) {
      showToast(`优化失败：${e.message}`);
    } finally {
      els.btnOptimize.disabled = false;
      if (span) span.textContent = orig;
    }
  });
  els.btnGenerate.addEventListener("click", generate);

  // ---- mode switcher (text2img / img2img) ----
  for (const btn of els.modeBtns) {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  }
  // Auto-switch to edit mode when the user drops/selects an image while in
  // text mode — keeps drop-anywhere behavior intuitive.

  // ---- reference image dropzone ----
  els.dropzone.addEventListener("click", (e) => {
    if (e.target.closest("#btn-remove-ref")) return;
    els.refFile.click();
  });
  els.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.refFile.click(); }
  });
  els.refFile.addEventListener("change", () => {
    const f = els.refFile.files && els.refFile.files[0];
    if (f) setRefImage(f);
  });
  ["dragenter", "dragover"].forEach(ev => {
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      els.dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(ev => {
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      els.dropzone.classList.remove("dragover");
    });
  });
  els.dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setRefImage(f);
  });
  // Prevent navigating away if a file is dropped outside the zone
  ["dragover", "drop"].forEach(ev => {
    window.addEventListener(ev, (e) => { e.preventDefault(); });
  });
  els.btnRemoveRef.addEventListener("click", (e) => {
    e.stopPropagation();
    clearRefImage();
  });
  const openFolder = async () => {
    const r = await fetch("/api/open-folder", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    showToast(j.ok ? "已打开文件夹" : "打开失败");
  };
  els.btnOpenFolder.addEventListener("click", openFolder);
  els.btnOpenFolderInline.addEventListener("click", openFolder);
  els.btnOpenImage.addEventListener("click", () => {
    if (lastImageUrl) window.open(lastImageUrl, "_blank");
    else showToast("尚未生成预览图");
  });
  els.btnPreviewMore.addEventListener("click", async () => {
    if (!lastFilename) { showToast("尚未生成预览图"); return; }
    const meta = await fetchPromptFor(lastFilename);
    if (meta && meta.prompt) {
      els.prompt.value = meta.prompt;
      els.charCount.textContent = meta.prompt.length;
      if (meta.size    && [...els.size.options].some(o => o.value === meta.size))    els.size.value    = meta.size;
      if (meta.quality && [...els.quality.options].some(o => o.value === meta.quality)) els.quality.value = meta.quality;
      if (meta.output_format && [...els.format.options].some(o => o.value === meta.output_format)) els.format.value = meta.output_format;
      if (meta.n) els.batch.value = meta.n;
      els.prompt.focus();
      showToast("已把 Prompt 复用到上方");
    } else {
      showToast("此图未找到 Prompt 记录");
    }
  });
  els.btnTerm.addEventListener("click", () => {
    showToast("后端日志由你的 Backend 实现提供");
  });
  els.btnUser.addEventListener("click", () => {
    showToast("当前账户：本地 (Backend Session)");
  });

  // theme
  const THEME_KEY = "image2.theme";
  function applyTheme(t) {
    document.body.classList.toggle("dark", t === "dark");
    els.themeIco.innerHTML = `<use href="${t === "dark" ? "#i-moon" : "#i-sun"}"/>`;
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  els.btnTheme.addEventListener("click", () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // history scroll
  els.histPrev.addEventListener("click", () => {
    els.historyStrip.scrollBy({ left: -els.historyStrip.clientWidth * 0.8, behavior: "smooth" });
  });
  els.histNext.addEventListener("click", () => {
    els.historyStrip.scrollBy({ left:  els.historyStrip.clientWidth * 0.8, behavior: "smooth" });
  });

  // ---- Backend control popover ----
  async function loadSettingsIntoMenu() {
    try {
      const r = await fetch("/api/settings");
      const j = await r.json();
      els.optShutdownBackend.checked = !!j.shutdown_backend_on_exit;
      autoOptimize = !!j.auto_optimize_prompt;
      els.optAutoOptimize.checked = autoOptimize;
    } catch (e) {}
  }

  function openMenu(open) {
    const next = open ?? els.backendMenu.hasAttribute("hidden");
    if (next) {
      els.backendMenu.removeAttribute("hidden");
      els.statusCard.setAttribute("aria-expanded", "true");
      loadSettingsIntoMenu();
    } else {
      els.backendMenu.setAttribute("hidden", "");
      els.statusCard.setAttribute("aria-expanded", "false");
    }
  }
  els.statusCard.addEventListener("click", (e) => {
    e.stopPropagation();
    openMenu();
  });
  document.addEventListener("click", (e) => {
    if (els.backendMenu.hasAttribute("hidden")) return;
    if (!els.backendMenu.contains(e.target) && !els.statusCard.contains(e.target)) {
      openMenu(false);
    }
  });

  function setMenuBusy(busy) {
    for (const b of els.backendMenu.querySelectorAll(".menu-item")) {
      b.disabled = busy;
    }
  }

  async function backendAction(act) {
    openMenu(false);
    if (act === "logs") {
      const r = await fetch("/api/backend/open-logs", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      showToast(j.ok ? "已打开 Backend 日志" : `打开失败：${j.error || ""}`);
      return;
    }
    if (act === "refresh") {
      els.statusSub.textContent = "刷新中…";
      await loadStatus();
      showToast("状态已刷新");
      return;
    }

    const labels = { start: "启动", stop: "停止", restart: "重启" };
    setMenuBusy(true);
    els.statusSub.textContent = `${labels[act]}中…`;
    setBackend("warn", `Backend ${labels[act]}中…`);
    try {
      const r = await fetch(`/api/backend/${act}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (act === "stop") {
        showToast(j.ok ? `已停止 (killed: ${j.killed ?? 0})` : `停止失败：${j.error || ""}`);
      } else if (j.ok) {
        showToast(`${labels[act]}成功`);
      } else {
        showToast(`${labels[act]}失败：${j.error || j.detail || "见日志"}`);
      }
    } catch (e) {
      showToast(`${labels[act]}失败：${e.message}`);
    } finally {
      setMenuBusy(false);
      await loadStatus();
    }
  }
  for (const btn of els.backendMenu.querySelectorAll(".menu-item")) {
    btn.addEventListener("click", () => backendAction(btn.dataset.act));
  }

  els.optShutdownBackend.addEventListener("change", async () => {
    const v = els.optShutdownBackend.checked;
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shutdown_backend_on_exit: v }),
      });
      showToast(v ? "已开启：关闭前端时同时关闭 Backend" : "已关闭：Backend 将保持运行");
    } catch (e) {
      showToast("设置保存失败");
      els.optShutdownBackend.checked = !v;
    }
  });

  els.optAutoOptimize.addEventListener("change", async () => {
    const v = els.optAutoOptimize.checked;
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_optimize_prompt: v }),
      });
      autoOptimize = v;
      showToast(v ? "已开启：生成前自动优化 Prompt" : "已关闭：自动优化");
    } catch (e) {
      showToast("设置保存失败");
      els.optAutoOptimize.checked = !v;
    }
  });

  // ---- view router ----
  const VIEW_LOADERS = {
    workbench: null,
    gallery:  loadGallery,
    history:  loadLog,
    model:    loadModels,
    settings: loadSettingsPage,
  };

  function switchView(tab) {
    document.querySelectorAll(".nav-item").forEach(n => {
      n.classList.toggle("active", n.dataset.tab === tab);
    });
    document.querySelectorAll(".view").forEach(v => {
      const match = v.dataset.view === tab;
      if (match) v.removeAttribute("hidden");
      else       v.setAttribute("hidden", "");
    });
    const loader = VIEW_LOADERS[tab];
    if (loader) loader();
  }
  for (const item of document.querySelectorAll(".nav-item")) {
    item.addEventListener("click", () => switchView(item.dataset.tab));
  }

  // ---- 图库 ----
  let galleryAll = [];
  async function loadGallery() {
    const stats = $("gallery-stats");
    const grid  = $("gallery-grid");
    stats.textContent = "加载中…";
    try {
      const r = await fetch("/api/history");
      const j = await r.json();
      galleryAll = j.items || [];
      renderGallery();
    } catch (e) {
      stats.textContent = "加载失败：" + e.message;
      grid.innerHTML = "";
    }
  }
  function renderGallery() {
    const grid = $("gallery-grid");
    const stats = $("gallery-stats");
    const q = ($("gallery-search").value || "").trim().toLowerCase();
    const items = q ? galleryAll.filter(it => it.filename.toLowerCase().includes(q)) : galleryAll;
    const totalBytes = items.reduce((a, it) => a + (it.size_bytes || 0), 0);
    stats.textContent = `共 ${items.length} 张${q ? "（过滤后）" : ""} · ${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
    grid.innerHTML = "";
    if (!items.length) {
      grid.innerHTML = '<div style="color:var(--text-mute);padding:24px;">暂无图片</div>';
      return;
    }
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "gallery-item";
      el.innerHTML = `
        <img loading="lazy" src="${it.url}" alt="">
        <div class="gallery-item-meta">
          <div class="gallery-item-name" title="${it.filename}">${it.filename}</div>
          <div class="gallery-item-sub">
            <span>${it.width}×${it.height}</span><span>·</span>
            <span>${fmtBytes(it.size_bytes)}</span><span>·</span>
            <span>${fmtClock(it.mtime)}</span>
          </div>
        </div>
        <div class="gallery-item-actions">
          <button class="icon-btn" data-act="open" title="放大"><svg><use href="#i-extlink"/></svg></button>
          <button class="icon-btn" data-act="delete" title="删除"><svg><use href="#i-trash"/></svg></button>
        </div>`;
      el.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (btn) {
          e.stopPropagation();
          if (btn.dataset.act === "delete") deleteImage(it.filename);
          else openLightbox(it);
        } else {
          openLightbox(it);
        }
      });
      grid.appendChild(el);
    }
  }
  function fmtBytes(n) {
    if (!n) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }
  async function deleteImage(name) {
    if (!confirm(`确定删除 ${name}？`)) return;
    const r = await fetch(`/api/image/${encodeURIComponent(name)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      showToast("已删除");
      galleryAll = galleryAll.filter(x => x.filename !== name);
      renderGallery();
      loadHistory();  // also refresh workbench strip
    } else {
      showToast("删除失败：" + (j.error || ""));
    }
  }
  $("gallery-search").addEventListener("input", () => renderGallery());
  $("btn-gallery-refresh").addEventListener("click", loadGallery);
  $("btn-gallery-open").addEventListener("click", openFolder);

  // lightbox
  const lb = $("lightbox");
  const lbImg = $("lightbox-img");
  const lbMeta = $("lightbox-meta");
  const lbPrompt = $("lightbox-prompt");
  const lbPromptBody = $("lightbox-prompt-body");
  const lbPromptTags = $("lightbox-prompt-tags");
  const lbPromptEmpty = $("lightbox-prompt-empty");
  let lbCurrentPrompt = null;

  async function fetchPromptFor(filename) {
    try {
      const r = await fetch(`/api/prompt/${encodeURIComponent(filename)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  const PROMPT_FOLD_KEY = "image2.promptFolded";
  function applyPromptFold() {
    const folded = localStorage.getItem(PROMPT_FOLD_KEY) === "1";
    lbPrompt.classList.toggle("collapsed", folded);
  }

  let lightboxToken = 0;
  async function openLightbox(it) {
    lbImg.src = it.url;
    lbMeta.textContent = `${it.filename} · ${it.width}×${it.height}`;
    lb.removeAttribute("hidden");

    // Hard-reset both panels and any leftover content from the previous open.
    // (Without `!important` in the CSS, the [hidden] attribute wouldn't beat
    // .lightbox-prompt's display:flex — that was the bug where image 2
    // showed image 1's prompt.)
    lbPrompt.setAttribute("hidden", "");
    lbPromptEmpty.setAttribute("hidden", "");
    lbPromptBody.textContent = "";
    lbPromptTags.innerHTML = "";
    lbCurrentPrompt = null;
    applyPromptFold();

    // Token guards against out-of-order responses if the user clicks fast.
    const myToken = ++lightboxToken;
    const meta = await fetchPromptFor(it.filename);
    if (myToken !== lightboxToken) return;  // user already opened another image

    if (meta && meta.prompt) {
      lbCurrentPrompt = meta;
      lbPromptBody.textContent = meta.prompt;
      const tags = [];
      if (meta.size)          tags.push(meta.size);
      if (meta.quality)       tags.push(meta.quality);
      if (meta.output_format) tags.push(meta.output_format.toUpperCase());
      if (meta.n && meta.n > 1) tags.push(`n=${meta.n}`);
      if (meta.source === "log") tags.push("from log");
      for (const t of tags) {
        const sp = document.createElement("span");
        sp.className = "tag";
        sp.textContent = t;
        lbPromptTags.appendChild(sp);
      }
      lbPrompt.removeAttribute("hidden");
    } else {
      lbPromptEmpty.removeAttribute("hidden");
    }
  }
  function closeLightbox() {
    lb.setAttribute("hidden", "");
    lbImg.src = "";
    lbCurrentPrompt = null;
  }
  $("lightbox-close").addEventListener("click", closeLightbox);
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

  $("lightbox-prompt-fold").addEventListener("click", () => {
    const nowFolded = !lbPrompt.classList.contains("collapsed");
    lbPrompt.classList.toggle("collapsed", nowFolded);
    localStorage.setItem(PROMPT_FOLD_KEY, nowFolded ? "1" : "0");
  });

  $("btn-prompt-reuse").addEventListener("click", () => {
    if (!lbCurrentPrompt) return;
    els.prompt.value = lbCurrentPrompt.prompt || "";
    els.charCount.textContent = els.prompt.value.length;
    if (lbCurrentPrompt.size    && [...els.size.options].some(o => o.value === lbCurrentPrompt.size))    els.size.value    = lbCurrentPrompt.size;
    if (lbCurrentPrompt.quality && [...els.quality.options].some(o => o.value === lbCurrentPrompt.quality)) els.quality.value = lbCurrentPrompt.quality;
    if (lbCurrentPrompt.output_format && [...els.format.options].some(o => o.value === lbCurrentPrompt.output_format)) els.format.value = lbCurrentPrompt.output_format;
    if (lbCurrentPrompt.n) els.batch.value = lbCurrentPrompt.n;
    closeLightbox();
    switchView("workbench");
    els.prompt.focus();
    showToast("已复用到工作台");
  });
  $("btn-prompt-copy").addEventListener("click", async () => {
    if (!lbCurrentPrompt || !lbCurrentPrompt.prompt) return;
    try {
      await navigator.clipboard.writeText(lbCurrentPrompt.prompt);
      showToast("已复制 Prompt");
    } catch { showToast("复制失败"); }
  });

  // ---- 生成记录 ----
  async function loadLog() {
    const stats = $("log-stats");
    const tbody = $("log-tbody");
    stats.textContent = "加载中…";
    try {
      const r = await fetch("/api/log");
      const j = await r.json();
      const items = j.items || [];
      const okCount = items.filter(x => x.status === "ok").length;
      stats.textContent = `共 ${items.length} 条 · 成功 ${okCount} · 失败 ${items.length - okCount}`;
      tbody.innerHTML = "";
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="log-empty">暂无生成记录</div></td></tr>';
        return;
      }
      for (const it of items) {
        const tr = document.createElement("tr");
        const t = new Date(it.ts * 1000);
        const tFmt = `${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
        const filename = (it.items && it.items[0] && it.items[0].filename) || "";
        const statusCls = it.status === "ok" ? "log-status-ok" : "log-status-err";
        const statusText = it.status === "ok" ? "成功" : "失败";
        tr.innerHTML = `
          <td class="log-time">${tFmt}</td>
          <td><div class="log-prompt" title="${escapeHtml(it.prompt || "")}">${escapeHtml(it.prompt || "")}</div></td>
          <td>${it.size || "—"}</td>
          <td>${it.quality || "—"}</td>
          <td>${it.output_format || "—"}</td>
          <td>${it.n || 1}</td>
          <td>${it.elapsed_ms != null ? (it.elapsed_ms / 1000).toFixed(1) + "s" : "—"}</td>
          <td><span class="${statusCls}">${statusText}</span></td>`;
        tr.addEventListener("click", () => {
          if (filename) {
            openLightbox({
              url: `/api/image/${encodeURIComponent(filename)}`,
              filename,
              width: (it.items && it.items[0] && it.items[0].width) || 0,
              height: (it.items && it.items[0] && it.items[0].height) || 0,
            });
          } else if (it.error) {
            showToast(it.error);
          }
        });
        tbody.appendChild(tr);
      }
    } catch (e) {
      stats.textContent = "加载失败：" + e.message;
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  }
  $("btn-log-refresh").addEventListener("click", loadLog);
  $("btn-log-clear").addEventListener("click", async () => {
    if (!confirm("确认清空生成记录？（不影响已保存的图片）")) return;
    await fetch("/api/log", { method: "DELETE" });
    showToast("已清空");
    loadLog();
  });

  // ---- 模型 ----
  async function loadModels() {
    const stats = $("models-stats");
    const grid  = $("models-grid");
    stats.textContent = "加载中…";
    try {
      const r = await fetch("/api/models");
      const j = await r.json();
      const items = j.items || [];
      stats.textContent = j.source === "backend"
        ? `来源：Backend · 共 ${items.length} 个模型`
        : `离线占位（${j.error || "Backend 不可达"}）`;
      grid.innerHTML = "";
      // image-related models go first
      items.sort((a, b) => {
        const ai = /image/i.test(a.id || "") ? 0 : 1;
        const bi = /image/i.test(b.id || "") ? 0 : 1;
        return ai - bi || (a.id || "").localeCompare(b.id || "");
      });
      for (const m of items) {
        const isImage = /image/i.test(m.id || "");
        const isCurrent = m.id === "gpt-image-2";
        const el = document.createElement("div");
        el.className = "model-card" + (isCurrent ? " featured" : "");
        el.innerHTML = `
          <div class="model-card-head">
            <div class="model-icon"><svg><use href="#i-cube"/></svg></div>
            <div style="min-width:0;flex:1;">
              <div class="model-id">${escapeHtml(m.id || "(unnamed)")}</div>
              <div class="model-meta">${escapeHtml(m.owned_by || m.object || "")}</div>
            </div>
          </div>
          <div>
            ${isImage ? '<span class="model-tag">图像</span>' : ""}
            ${isCurrent ? '<span class="model-tag">工作台默认</span>' : ""}
            ${m.created ? `<span class="model-tag">${new Date(m.created * 1000).getFullYear()}</span>` : ""}
          </div>`;
        grid.appendChild(el);
      }
      if (!items.length) {
        grid.innerHTML = '<div style="color:var(--text-mute);padding:24px;">未列出任何模型</div>';
      }
    } catch (e) {
      stats.textContent = "加载失败：" + e.message;
    }
  }
  $("btn-models-refresh").addEventListener("click", loadModels);

  // ---- 设置 ----
  async function loadSettingsPage() {
    try {
      const [statusRes, settingsRes] = await Promise.all([
        fetch("/api/status").then(r => r.json()),
        fetch("/api/settings").then(r => r.json()),
      ]);
      // populate selects from status allowed_*
      fillSelect($("st-size"),    statusRes.allowed_sizes,    settingsRes.default_size);
      fillSelect($("st-quality"), statusRes.allowed_quality,  settingsRes.default_quality);
      fillSelect($("st-format"),  statusRes.allowed_formats,  settingsRes.default_format);

      $("st-start-backend").checked    = !!settingsRes.start_backend_on_launch;
      $("st-shutdown-backend").checked = !!settingsRes.shutdown_backend_on_exit;
      $("st-auto-open").checked    = !!settingsRes.auto_open_folder_on_save;
      $("st-theme").value          = settingsRes.theme || "light";
      $("st-n").value              = settingsRes.default_n || 1;

      // background
      $("st-bg-enabled").checked   = !!settingsRes.background_enabled;
      const op = settingsRes.background_opacity ?? 60;
      const bl = settingsRes.background_blur ?? 0;
      $("st-bg-opacity").value     = op;
      $("st-bg-blur").value        = bl;
      $("bg-opacity-val").textContent = op;
      $("bg-blur-val").textContent    = bl;
      const hasBg = !!settingsRes.background_ext;
      $("bg-status").textContent = hasBg
        ? `已设置（${settingsRes.background_ext}）`
        : "未设置";
      $("bg-thumb").style.backgroundImage = hasBg
        ? `url('/api/background?t=${Date.now()}')`
        : "none";

      $("info-version").textContent  = "v" + (statusRes.version || "?");
      $("info-listen").textContent   = settingsRes.listen || "—";
      $("info-upstream").textContent = settingsRes.upstream || "—";
      $("info-save-dir").textContent = settingsRes.save_dir || "—";
      $("info-config").textContent   = settingsRes.backend_config_path || "—";
      $("info-prefs").textContent    = settingsRes.settings_path || "—";
      $("info-log").textContent      = settingsRes.log_path || "—";
    } catch (e) {
      showToast("设置加载失败：" + e.message);
    }
  }
  async function patchSetting(patch) {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      showToast("保存失败：" + e.message);
    }
  }
  $("st-shutdown-backend").addEventListener("change", (e) => {
    patchSetting({ shutdown_backend_on_exit: e.target.checked });
    els.optShutdownBackend.checked = e.target.checked;
    showToast(e.target.checked ? "关闭前端时同时关闭 Backend：开" : "已关闭");
  });
  $("st-start-backend").addEventListener("change", (e) => {
    patchSetting({ start_backend_on_launch: e.target.checked });
    showToast(e.target.checked ? "下次启动 App 会自动启动 Backend" : "已关闭自动启动");
  });
  $("st-auto-open").addEventListener("change", (e) => {
    patchSetting({ auto_open_folder_on_save: e.target.checked });
  });
  $("st-theme").addEventListener("change", (e) => {
    const t = e.target.value;
    document.body.classList.toggle("dark", t === "dark");
    els.themeIco.innerHTML = `<use href="${t === "dark" ? "#i-moon" : "#i-sun"}"/>`;
    localStorage.setItem("image2.theme", t);
    patchSetting({ theme: t });
  });
  $("st-size").addEventListener("change",    (e) => patchSetting({ default_size: e.target.value }));
  $("st-quality").addEventListener("change", (e) => patchSetting({ default_quality: e.target.value }));
  $("st-format").addEventListener("change",  (e) => patchSetting({ default_format: e.target.value }));
  $("st-n").addEventListener("change",       (e) => patchSetting({ default_n: parseInt(e.target.value, 10) || 1 }));

  // ---- background image ----
  const appBg = $("app-bg");
  let bgState = { enabled: false, opacity: 60, blur: 0, ext: "" };

  function applyBg() {
    document.body.classList.toggle("has-bg", !!bgState.enabled && !!bgState.ext);
    if (bgState.enabled && bgState.ext) {
      appBg.style.backgroundImage = `url('/api/background?t=${Date.now()}')`;
      appBg.style.opacity = (bgState.opacity / 100).toFixed(2);
      appBg.style.filter  = `blur(${bgState.blur}px)`;
    } else {
      appBg.style.backgroundImage = "none";
      appBg.style.opacity = "0";
      appBg.style.filter  = "none";
    }
  }
  async function loadBgFromSettings() {
    try {
      const s = await fetch("/api/settings").then(r => r.json());
      bgState.enabled = !!s.background_enabled;
      bgState.opacity = s.background_opacity ?? 60;
      bgState.blur    = s.background_blur ?? 0;
      bgState.ext     = s.background_ext || "";
      applyBg();
    } catch {}
  }

  $("st-bg-enabled").addEventListener("change", async (e) => {
    bgState.enabled = e.target.checked;
    await patchSetting({ background_enabled: bgState.enabled });
    applyBg();
  });
  $("st-bg-opacity").addEventListener("input", (e) => {
    bgState.opacity = parseInt(e.target.value, 10);
    $("bg-opacity-val").textContent = bgState.opacity;
    applyBg();
  });
  $("st-bg-opacity").addEventListener("change", (e) => {
    patchSetting({ background_opacity: parseInt(e.target.value, 10) });
  });
  $("st-bg-blur").addEventListener("input", (e) => {
    bgState.blur = parseInt(e.target.value, 10);
    $("bg-blur-val").textContent = bgState.blur;
    applyBg();
  });
  $("st-bg-blur").addEventListener("change", (e) => {
    patchSetting({ background_blur: parseInt(e.target.value, 10) });
  });
  $("st-bg-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    showToast("上传中…");
    try {
      const r = await fetch("/api/background", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) { showToast("上传失败：" + (j.error || "")); return; }
      bgState.enabled = true;
      bgState.ext = j.ext;
      $("st-bg-enabled").checked = true;
      $("bg-status").textContent = `已设置（${j.ext}）`;
      $("bg-thumb").style.backgroundImage = `url('/api/background?t=${Date.now()}')`;
      applyBg();
      showToast("背景已更新");
    } catch (err) {
      showToast("上传失败：" + err.message);
    } finally {
      e.target.value = "";
    }
  });
  $("btn-bg-clear").addEventListener("click", async () => {
    if (!confirm("清除背景图？")) return;
    const r = await fetch("/api/background", { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (j.ok) {
      bgState.enabled = false;
      bgState.ext = "";
      $("st-bg-enabled").checked = false;
      $("bg-status").textContent = "未设置";
      $("bg-thumb").style.backgroundImage = "none";
      applyBg();
      showToast("已清除");
    }
  });

  // ---- save-target selector (workbench) ----
  function applySaveTarget(t) {
    saveTarget = (t === "phone" || t === "both") ? t : "pc";
    for (const b of els.saveTargetBtns) {
      const active = b.dataset.target === saveTarget;
      b.classList.toggle("active", active);
      b.setAttribute("aria-checked", active ? "true" : "false");
    }
    if (els.saveTargetHint) {
      els.saveTargetHint.textContent = SAVE_TARGET_HINTS[saveTarget];
      els.saveTargetHint.classList.toggle("warn", saveTarget === "phone");
    }
    try { localStorage.setItem(SAVE_TARGET_KEY, saveTarget); } catch {}
  }
  for (const b of els.saveTargetBtns) {
    b.addEventListener("click", () => applySaveTarget(b.dataset.target));
  }
  applySaveTarget(localStorage.getItem(SAVE_TARGET_KEY) || "pc");

  if (els.hostedMode) {
    els.hostedMode.addEventListener("change", (e) => setHostedMode(e.target.checked));
  }
  if (els.stHostedMode) {
    els.stHostedMode.addEventListener("change", (e) => setHostedMode(e.target.checked));
  }
  let storedHosted = "";
  try { storedHosted = localStorage.getItem(HOSTED_MODE_KEY) || ""; } catch {}
  setHostedMode(storedHosted === "1");
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resumeHostedTask();
  });
  window.addEventListener("focus", resumeHostedTask);

  // ---- phone download helper ----
  // Decode b64 → Blob → trigger an <a download> click. Works on Chrome/Firefox
  // on Android out of the box. iOS Safari may instead open the image inline;
  // long-press → "Save to Photos" still works as a fallback.
  function b64ToBlob(b64, mime) {
    const bin = atob(b64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || "application/octet-stream" });
  }
  function triggerPhoneDownload(b64, mime, filename) {
    const blob = b64ToBlob(b64, mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "image.png";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function downloadItemsToPhone(items) {
    if (!items || !items.length) return 0;
    let triggered = 0;
    items.forEach((it, i) => {
      if (!it || !it.b64_json) return;
      // Stagger so iOS doesn't squash the second download.
      setTimeout(
        () => triggerPhoneDownload(it.b64_json, it.mime, it.filename),
        i * 350
      );
      triggered++;
    });
    return triggered;
  }
  // Expose so generate() (declared earlier in this IIFE) can call back.
  window.__image2 = window.__image2 || {};
  window.__image2.saveTarget = () => saveTarget;
  window.__image2.downloadItemsToPhone = downloadItemsToPhone;

  // ---- mobile mode card ----
  async function refreshMobileCard() {
    const enabledChk = $("st-mobile-enabled");
    const urlEl      = $("mobile-url-display");
    const protoEl    = $("mobile-proto");
    const dnsEl      = $("mobile-dns");
    if (!enabledChk || !urlEl) return;
    try {
      const r = await fetch("/api/mobile/status");
      const j = await r.json();
      enabledChk.checked = !!j.enabled;
      urlEl.classList.toggle("on", !!j.enabled && !!j.url);
      urlEl.classList.toggle("off", !j.enabled || !j.url);
      urlEl.textContent = j.url || (j.tailscale_available ? "未启用" : "未检测到 Tailscale 客户端");
      protoEl.textContent = j.proto ? j.proto.toUpperCase() : "—";
      dnsEl.textContent   = j.dns_name || "—";
      enabledChk.disabled = !j.tailscale_available;
    } catch (e) {
      urlEl.textContent = "状态查询失败";
      urlEl.classList.add("off");
      urlEl.classList.remove("on");
    }
  }
  async function setMobileMode(on) {
    const urlEl = $("mobile-url-display");
    if (urlEl) {
      urlEl.textContent = on ? "正在发布到 tailnet…" : "正在停止…";
      urlEl.classList.remove("on"); urlEl.classList.add("off");
    }
    try {
      const r = await fetch(on ? "/api/mobile/start" : "/api/mobile/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: on ? JSON.stringify({ prefer_https: true }) : null,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        showToast(`手机模式${on ? "启动" : "停止"}失败：${j.error || r.status}`);
      } else if (on) {
        showToast(j.warning || `手机模式已启动 · ${j.proto.toUpperCase()}`);
      } else {
        showToast("手机模式已停止");
      }
    } catch (e) {
      showToast(`手机模式${on ? "启动" : "停止"}异常：${e.message}`);
    } finally {
      refreshMobileCard();
    }
  }
  const mobileEnabledChk = $("st-mobile-enabled");
  if (mobileEnabledChk) {
    mobileEnabledChk.addEventListener("change", (e) => setMobileMode(e.target.checked));
  }
  const btnMobileCopy = $("btn-mobile-copy");
  if (btnMobileCopy) {
    btnMobileCopy.addEventListener("click", async () => {
      const text = ($("mobile-url-display").textContent || "").trim();
      if (!text || !/^https?:/.test(text)) { showToast("当前没有可复制的地址"); return; }
      try { await navigator.clipboard.writeText(text); showToast("已复制访问地址"); }
      catch { showToast("复制失败"); }
    });
  }
  const btnMobileOpen = $("btn-mobile-open");
  if (btnMobileOpen) {
    btnMobileOpen.addEventListener("click", () => {
      const text = ($("mobile-url-display").textContent || "").trim();
      if (!text || !/^https?:/.test(text)) { showToast("尚未启用手机模式"); return; }
      window.open(text, "_blank", "noopener");
    });
  }
  const btnMobileRestart = $("btn-mobile-restart");
  if (btnMobileRestart) {
    btnMobileRestart.addEventListener("click", async () => {
      btnMobileRestart.disabled = true;
      try {
        await fetch("/api/mobile/stop", { method: "POST" });
        await setMobileMode(true);
      } finally {
        btnMobileRestart.disabled = false;
      }
    });
  }
  // Refresh the mobile card whenever the settings tab is opened. We override
  // the entry in the router map directly because VIEW_LOADERS captured the
  // original function reference at construction time.
  const _origLoadSettings = VIEW_LOADERS.settings;
  VIEW_LOADERS.settings = async function() {
    await _origLoadSettings.apply(this, arguments);
    refreshMobileCard();
  };

  loadBgFromSettings();
  loadStatus().then(loadHistory);
  loadSettingsIntoMenu();   // pull autoOptimize on startup
  resumeHostedTask();
  setInterval(loadStatus, 10000);

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();




