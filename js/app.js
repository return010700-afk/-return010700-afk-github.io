(function () {
  const FPS = 30;
  const FRAME_DELAY = Math.round(1000 / FPS);
  const MAX_SECONDS = 8;
  const DEFAULT_WIDTH = 480;

  const FORMATS = [
    { ext: "mp4", label: "MP4", color: "#2f7d4a" },
    { ext: "mov", label: "MOV", color: "#3d8f5c" },
    { ext: "avi", label: "AVI", color: "#5a9e6c" },
    { ext: "webm", label: "WebM", color: "#6ea87a" }
  ];

  const FORMAT_MAP = Object.fromEntries(FORMATS.map((item) => [item.ext, item]));

  const els = {
    fileInput: document.getElementById("fileInput"),
    pickBtn: document.getElementById("pickBtn"),
    formatIcons: document.getElementById("formatIcons"),
    errorBanner: document.getElementById("errorBanner"),
    errorMessage: document.getElementById("errorMessage"),
    errorFormats: document.getElementById("errorFormats"),
    jobList: document.getElementById("jobList"),
    emptyHistory: document.getElementById("emptyHistory"),
    selectAll: document.getElementById("selectAll"),
    deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
    modeModal: document.getElementById("modeModal"),
    modeFileName: document.getElementById("modeFileName"),
    modeCancel: document.getElementById("modeCancel")
  };

  const jobs = [];
  let pendingFile = null;
  let workerScriptUrl = "lib/gif.worker.js";

  prepareWorkerScript();
  renderFormatIcons(els.formatIcons);
  renderFormatIcons(els.errorFormats);
  bindEvents();

  function prepareWorkerScript() {
    const source = window.GIF_WORKER_SOURCE;
    if (source) {
      workerScriptUrl = URL.createObjectURL(
        new Blob([source], { type: "application/javascript" })
      );
      return;
    }
    workerScriptUrl = "lib/gif.worker.js";
  }

  function bindEvents() {
    els.pickBtn.addEventListener("click", function () {
      els.fileInput.click();
    });

    els.fileInput.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (file) handleIncomingFile(file);
      els.fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (type) {
      els.pickBtn.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        els.pickBtn.classList.add("dragover");
      });
    });

    ["dragleave", "dragend", "drop"].forEach(function (type) {
      els.pickBtn.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        els.pickBtn.classList.remove("dragover");
      });
    });

    els.pickBtn.addEventListener("drop", function (event) {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      handleIncomingFile(files[0]);
    });

    Array.prototype.forEach.call(document.querySelectorAll(".mode-card"), function (card) {
      card.addEventListener("click", function () {
        if (!pendingFile) return;
        const file = pendingFile;
        const mode = card.getAttribute("data-mode");
        closeModeModal();
        createJob(file, mode);
      });
    });

    els.modeCancel.addEventListener("click", closeModeModal);
    els.modeModal.addEventListener("click", function (event) {
      if (event.target === els.modeModal) closeModeModal();
    });

    els.selectAll.addEventListener("change", function () {
      jobs.forEach(function (job) {
        job.selected = els.selectAll.checked;
      });
      renderJobs();
    });

    els.deleteSelectedBtn.addEventListener("click", function () {
      const remain = jobs.filter(function (job) {
        if (job.selected) {
          cleanupJob(job);
          return false;
        }
        return true;
      });
      jobs.length = 0;
      remain.forEach(function (job) {
        jobs.push(job);
      });
      els.selectAll.checked = false;
      renderJobs();
    });

    els.jobList.addEventListener("change", function (event) {
      const job = findJobFromEvent(event);
      if (!job) return;
      if (event.target.getAttribute("data-act") === "select") {
        job.selected = event.target.checked;
        syncSelectionBar();
      }
    });

    els.jobList.addEventListener("input", function (event) {
      const job = findJobFromEvent(event);
      if (!job) return;
      const act = event.target.getAttribute("data-act");
      if (act === "name") {
        job.customName = event.target.value;
        const saveLabel = event.target.closest(".job-card").querySelector("[data-role='save-name']");
        if (saveLabel) saveLabel.innerHTML = "<b>저장 이름</b>" + escapeHtml(getSaveName(job));
      }
      if (act === "width") {
        job.outWidth = Number(event.target.value);
        const output = event.target.parentElement.querySelector("output");
        if (output) output.textContent = job.outWidth + "px";
      }
    });

    els.jobList.addEventListener("click", function (event) {
      const button = event.target.closest("[data-act]");
      if (!button || button.tagName !== "BUTTON") return;
      const job = findJobFromEvent(event);
      if (!job) return;
      const act = button.getAttribute("data-act");
      if (act === "delete") removeJob(job.id);
      if (act === "convert") startConvert(job);
      if (act === "download") startDownload(job);
      if (act === "play") handlePlay(job);
      if (act === "stop") handleStop(job);
    });
  }

  function findJobFromEvent(event) {
    const card = event.target.closest(".job-card");
    if (!card) return null;
    return jobs.find(function (item) {
      return item.id === card.dataset.id;
    });
  }

  function renderFormatIcons(target) {
    target.innerHTML = FORMATS.map(function (item) {
      return (
        '<div class="format-item">' +
        '<div class="format-icon" style="background:' + item.color + '">' + item.label + "</div>" +
        "<span>." + item.ext + "</span>" +
        "</div>"
      );
    }).join("");
  }

  function handleIncomingFile(file) {
    const ext = getExtension(file.name);
    if (!FORMAT_MAP[ext]) {
      showFormatError(
        "선택한 파일(" +
          file.name +
          ")은 지원하지 않는 형식입니다. 아래 변환 가능한 동영상 포맷 중에서 다시 선택해 주세요."
      );
      return;
    }

    hideFormatError();
    pendingFile = file;
    els.modeFileName.textContent = file.name;
    els.modeModal.hidden = false;
  }

  function closeModeModal() {
    pendingFile = null;
    els.modeModal.hidden = true;
  }

  function createJob(file, mode) {
    const ext = getExtension(file.name);
    const job = {
      id: "job-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      file: file,
      objectUrl: URL.createObjectURL(file),
      originalName: file.name,
      baseName: file.name.replace(/\.[^.]+$/, ""),
      customName: "",
      ext: ext,
      mode: mode,
      modeLabel: mode === "ani" ? "애니" : "GIF",
      sizeText: formatBytes(file.size),
      typeText: file.type || FORMAT_MAP[ext].label,
      width: 0,
      height: 0,
      duration: 0,
      outWidth: DEFAULT_WIDTH,
      status: "준비 중",
      statusClass: "status-work",
      progress: 0,
      progressText: "파일 정보를 읽는 중",
      thumbs: [],
      gifUrl: "",
      gifBlob: null,
      selected: false,
      converting: false,
      encoding: false,
      paused: false,
      encoder: null,
      downloading: false,
      downloadPaused: false,
      downloadTimer: null,
      downloadProgress: 0
    };

    jobs.unshift(job);
    renderJobs();
    inspectVideo(job);
  }

  function inspectVideo(job) {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = job.objectUrl;

    const fail = function () {
      showFormatError(
        job.originalName +
          " 파일은 확장자는 동영상이지만, 이 브라우저에서 프레임을 읽을 수 없습니다. MP4, MOV, AVI, WebM 중에서 다시 올려 주세요."
      );
      removeJob(job.id, false);
    };

    video.addEventListener("loadedmetadata", function () {
      if (!video.videoWidth || !video.duration || !isFinite(video.duration)) {
        fail();
        return;
      }
      job.width = video.videoWidth;
      job.height = video.videoHeight;
      job.duration = video.duration;
      job.outWidth = Math.min(DEFAULT_WIDTH, video.videoWidth);
      job.status = "변환 대기";
      job.statusClass = "status-ready";
      job.progressText = "파일 정보를 확인했습니다. 변환을 시작할 수 있습니다.";
      updateJobCard(job);
    });

    video.addEventListener("error", fail);
  }

  function handlePlay(job) {
    if (job.downloading && job.downloadPaused) {
      job.downloadPaused = false;
      tickDownload(job);
      return;
    }
    if (job.gifBlob && !job.converting) {
      startDownload(job);
      return;
    }
    if (job.paused && job.converting) {
      job.paused = false;
      job.status = "변환 중";
      job.statusClass = "status-work";
      job.progressText = "변환을 다시 진행합니다";
      updateJobCard(job);
      return;
    }
    startConvert(job);
  }

  function handleStop(job) {
    if (job.downloading) {
      job.downloadPaused = true;
      job.progressText = "다운로드가 중지되었습니다. 재생을 누르면 이어서 받을 수 있습니다.";
      job.status = "다운로드 중지";
      job.statusClass = "status-pause";
      updateJobCard(job, { keepInputs: true });
      return;
    }
    if (job.converting) {
      job.paused = true;
      job.status = "변환 중지";
      job.statusClass = "status-pause";
      job.progressText = "변환이 중지되었습니다. 재생을 누르면 이어서 진행합니다.";
      if (job.encoding && job.encoder && job.encoder.abort) job.encoder.abort();
      updateJobCard(job);
    }
  }

  function startConvert(job) {
    if (job.converting && !job.paused) return;
    if (job.converting && job.paused) {
      handlePlay(job);
      return;
    }
    job.converting = true;
    job.paused = false;
    job.status = "변환 중";
    job.statusClass = "status-work";
    job.progress = 0;
    job.progressText = "30FPS로 프레임을 나누는 중";
    job.thumbs = [];
    if (job.gifUrl) URL.revokeObjectURL(job.gifUrl);
    job.gifUrl = "";
    job.gifBlob = null;
    updateJobCard(job);

    convertToGif(job).catch(function (error) {
      job.encoder = null;
      job.encoding = false;
      if (job.paused) {
        job.converting = false;
        job.progressText = "변환이 중지되었습니다. 재생을 누르면 다시 시작합니다.";
        updateJobCard(job);
        return;
      }
      job.converting = false;
      job.status = "변환 실패";
      job.statusClass = "status-fail";
      job.progressText = error.message || "변환에 실패했습니다.";
      updateJobCard(job);
    });
  }

  async function convertToGif(job) {
    const video = document.createElement("video");
    video.src = job.objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await waitForEvent(video, "loadeddata");

    const seconds = Math.min(video.duration, MAX_SECONDS);
    const frameCount = Math.max(1, Math.round(seconds * FPS));
    const outWidth = even(job.outWidth);
    const outHeight = even(Math.max(2, Math.round((video.videoHeight / video.videoWidth) * outWidth)));
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const work = job.mode === "ani" ? makeWorkCanvas(outWidth, outHeight) : null;

    const gif = new GIF({
      workers: 2,
      quality: job.mode === "ani" ? 8 : 10,
      workerScript: workerScriptUrl,
      width: outWidth,
      height: outHeight,
      repeat: 0
    });
    job.encoder = gif;

    const keyIndexes = uniqueIndexes(
      [0.1, 0.3, 0.5, 0.7, 0.9].map(function (ratio) {
        return Math.min(frameCount - 1, Math.round(ratio * (frameCount - 1)));
      })
    );

    for (let i = 0; i < frameCount; i += 1) {
      await waitIfPaused(job);
      const t = frameCount <= 1 ? 0 : i / (frameCount - 1);
      const time = Math.min(seconds - 0.001, i / FPS);
      await seekVideo(video, time);
      if (job.mode === "ani") {
        await renderCartoonMovieFrame(ctx, work, video, outWidth, outHeight, t, i);
      } else {
        await drawVideoFrame(ctx, video, outWidth, outHeight);
      }
      gif.addFrame(ctx.getImageData(0, 0, outWidth, outHeight), { delay: FRAME_DELAY });

      if (keyIndexes.indexOf(i) !== -1) {
        job.thumbs.push({
          src: canvas.toDataURL("image/jpeg", 0.82),
          caption: sceneCaption(i, frameCount)
        });
      }

      job.progress = Math.round(((i + 1) / frameCount) * 70);
      job.progressText = (job.mode === "ani" ? "올린 영상을 만화영화로 그리는 중 " : "프레임 추출 ") + (i + 1) + " / " + frameCount + " (30FPS)";
      updateJobCard(job, { keepInputs: true });
    }

    await new Promise(function (resolve, reject) {
      gif.on("progress", function (value) {
        job.progress = 70 + Math.round(value * 30);
        job.progressText = job.mode === "ani" ? "만화영화를 이어 붙이는 중" : "GIF 애니메이션을 만드는 중";
        updateJobCard(job, { keepInputs: true });
      });
      gif.on("finished", function (blob) {
        job.gifBlob = blob;
        job.gifUrl = URL.createObjectURL(blob);
        job.progress = 100;
        job.progressText = "변환이 완료되었습니다. 재생을 누르면 다운로드를 시작합니다.";
        job.status = "완료";
        job.statusClass = "status-done";
        job.converting = false;
        job.encoder = null;
        updateJobCard(job);
        resolve();
      });
      gif.on("abort", function () {
        reject(new Error("변환이 중지되었습니다."));
      });
      try {
        job.encoding = true;
        gif.render();
      } catch (error) {
        reject(error);
      }
    });
  }

  function startDownload(job) {
    if (!job.gifBlob || job.converting) return;
    if (job.downloading && !job.downloadPaused) return;
    if (job.downloading && job.downloadPaused) {
      job.downloadPaused = false;
      job.status = "다운로드 중";
      job.statusClass = "status-work";
      tickDownload(job);
      return;
    }
    job.downloading = true;
    job.downloadPaused = false;
    job.downloadProgress = 0;
    job.status = "다운로드 중";
    job.statusClass = "status-work";
    job.progress = 0;
    job.progressText = job.modeLabel + " 파일을 내려받는 중";
    updateJobCard(job);
    tickDownload(job);
  }

  function tickDownload(job) {
    if (!job.downloading || job.downloadPaused) return;
    job.downloadProgress = Math.min(100, job.downloadProgress + 8);
    job.progress = job.downloadProgress;
    job.progressText = job.modeLabel + " 다운로드 " + job.progress + "%";
    updateJobCard(job, { keepInputs: true });
    if (job.downloadProgress >= 100) {
      finishDownload(job);
      return;
    }
    job.downloadTimer = setTimeout(function () {
      tickDownload(job);
    }, 90);
  }

  function finishDownload(job) {
    const raw = (job.customName || "").trim() || job.baseName;
    const safe = raw.replace(/\.gif$/i, "");
    const link = document.createElement("a");
    link.href = job.gifUrl;
    link.download = safe + ".gif";
    document.body.appendChild(link);
    link.click();
    link.remove();
    job.downloading = false;
    job.downloadPaused = false;
    job.progress = 100;
    job.status = "완료";
    job.statusClass = "status-done";
    job.progressText = "다운로드가 완료되었습니다";
    updateJobCard(job);
  }

  function removeJob(id, rerender) {
    const index = jobs.findIndex(function (job) {
      return job.id === id;
    });
    if (index === -1) return;
    cleanupJob(jobs[index]);
    jobs.splice(index, 1);
    if (rerender !== false) renderJobs();
  }

  function cleanupJob(job) {
    job.paused = true;
    job.downloading = false;
    if (job.downloadTimer) clearTimeout(job.downloadTimer);
    if (job.encoder && job.encoder.abort) job.encoder.abort();
    if (job.objectUrl) URL.revokeObjectURL(job.objectUrl);
    if (job.gifUrl) URL.revokeObjectURL(job.gifUrl);
  }

  function renderJobs() {
    els.emptyHistory.hidden = jobs.length > 0;
    els.jobList.innerHTML = jobs.map(jobCardHtml).join("");
    syncSelectionBar();
  }

  function updateJobCard(job, options) {
    const card = els.jobList.querySelector('[data-id="' + job.id + '"]');
    if (!card) {
      renderJobs();
      return;
    }

    if (options && options.keepInputs) {
      const status = card.querySelector("[data-role='status']");
      const resolution = card.querySelector("[data-role='resolution']");
      const duration = card.querySelector("[data-role='duration']");
      const progressText = card.querySelector("[data-role='progress-text']");
      const progressValue = card.querySelector("[data-role='progress-value']");
      const progressBar = card.querySelector("[data-role='progress-bar']");
      const thumbs = card.querySelector("[data-role='thumbs']");
      const playBtn = card.querySelector("[data-act='play']");
      const stopBtn = card.querySelector("[data-act='stop']");
      if (status) {
        status.className = job.statusClass;
        status.textContent = "· " + job.status;
      }
      if (resolution) resolution.innerHTML = "<b>해상도</b>" + (job.width ? job.width + " × " + job.height : "확인 중");
      if (duration) duration.innerHTML = "<b>길이</b>" + (job.duration ? formatTime(job.duration) : "확인 중");
      if (progressText) progressText.textContent = job.progressText;
      if (progressValue) progressValue.textContent = job.progress + "%";
      if (progressBar) progressBar.style.width = job.progress + "%";
      if (thumbs) thumbs.innerHTML = thumbHtml(job);
      if (playBtn) playBtn.disabled = !(job.paused || job.downloadPaused || (!job.converting && job.gifBlob) || canStartConvert(job));
      if (stopBtn) stopBtn.disabled = !(job.converting || job.downloading);
      return;
    }

    card.outerHTML = jobCardHtml(job);
    syncSelectionBar();
  }

  function canStartConvert(job) {
    return !job.converting && (job.statusClass === "status-ready" || job.statusClass === "status-fail" || job.statusClass === "status-done" || job.statusClass === "status-pause");
  }

  function jobCardHtml(job) {
    const canConvert = canStartConvert(job);
    const canStop = job.converting || job.downloading;
    const canPlay = job.paused || job.downloadPaused || (!job.converting && !!job.gifBlob) || canConvert;
    return (
      "<article class=\"job-card\" data-id=\"" + job.id + "\">" +
      "<div class=\"job-top\">" +
      "<label class=\"check-label\"><input type=\"checkbox\" data-act=\"select\" " + (job.selected ? "checked" : "") + " /></label>" +
      "<div class=\"job-info\">" +
      "<h3>" + escapeHtml(job.originalName) + " <span class=\"mode-pill\">" + job.modeLabel + "</span> <span data-role=\"status\" class=\"" + job.statusClass + "\">· " + job.status + "</span></h3>" +
      "<div class=\"meta-grid\">" +
      "<div><b>형식</b>." + job.ext.toUpperCase() + "</div>" +
      "<div><b>크기</b>" + job.sizeText + "</div>" +
      "<div data-role=\"resolution\"><b>해상도</b>" + (job.width ? job.width + " × " + job.height : "확인 중") + "</div>" +
      "<div data-role=\"duration\"><b>길이</b>" + (job.duration ? formatTime(job.duration) : "확인 중") + "</div>" +
      "<div data-role=\"save-name\"><b>저장 이름</b>" + escapeHtml(getSaveName(job)) + "</div>" +
      "<div><b>프레임</b>30FPS · 최대 " + MAX_SECONDS + "초</div>" +
      "</div></div>" +
      "<div class=\"job-tools\">" +
      "<button type=\"button\" class=\"trash-btn\" data-act=\"delete\" title=\"이 기록 삭제\" aria-label=\"기록 삭제\">" +
      trashIcon() +
      "</button></div></div>" +
      "<div class=\"settings-row\">" +
      "<label class=\"field\">다운로드 파일 이름" +
      "<input type=\"text\" data-act=\"name\" value=\"" + escapeAttr(job.customName) + "\" placeholder=\"" + escapeAttr(job.baseName) + "\" />" +
      "</label>" +
      "<label class=\"field\">출력 가로 크기" +
      "<span class=\"range-line\">" +
      "<input type=\"range\" data-act=\"width\" min=\"240\" max=\"800\" step=\"10\" value=\"" + job.outWidth + "\" />" +
      "<output>" + job.outWidth + "px</output>" +
      "</span></label></div>" +
      "<div class=\"action-row\">" +
      "<button type=\"button\" class=\"convert-btn\" data-act=\"convert\" " + (canConvert ? "" : "disabled") + ">" + job.modeLabel + "로 변환</button>" +
      "<button type=\"button\" class=\"download-btn\" data-act=\"download\" " + (job.gifBlob && !job.converting ? "" : "disabled") + ">" + job.modeLabel + " 다운로드</button>" +
      "<div class=\"transport\">" +
      "<button type=\"button\" class=\"transport-btn play-btn\" data-act=\"play\" title=\"재생\" aria-label=\"재생\" " + (canPlay ? "" : "disabled") + ">" + playIcon() + "</button>" +
      "<button type=\"button\" class=\"transport-btn stop-btn\" data-act=\"stop\" title=\"중지\" aria-label=\"중지\" " + (canStop ? "" : "disabled") + ">" + stopIcon() + "</button>" +
      "</div></div>" +
      "<div class=\"progress-wrap\">" +
      "<div class=\"progress-label\"><span data-role=\"progress-text\">" + escapeHtml(job.progressText) + "</span><span data-role=\"progress-value\">" + job.progress + "%</span></div>" +
      "<div class=\"progress-track\"><div class=\"progress-bar\" data-role=\"progress-bar\" style=\"width:" + job.progress + "%\"></div></div>" +
      "</div>" +
      "<div class=\"thumbs\" data-role=\"thumbs\">" + thumbHtml(job) + "</div>" +
      "</article>"
    );
  }

  function thumbHtml(job) {
    return job.thumbs.map(function (thumb) {
      return (
        "<figure class=\"thumb\">" +
        "<img src=\"" + thumb.src + "\" alt=\"" + escapeHtml(thumb.caption) + "\" />" +
        "<figcaption>" + escapeHtml(thumb.caption) + "</figcaption>" +
        "</figure>"
      );
    }).join("");
  }

  function syncSelectionBar() {
    els.deleteSelectedBtn.disabled = !jobs.some(function (job) {
      return job.selected;
    });
    els.selectAll.checked = jobs.length > 0 && jobs.every(function (job) {
      return job.selected;
    });
  }

  function showFormatError(message) {
    els.errorMessage.textContent = message;
    els.errorBanner.hidden = false;
    els.errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideFormatError() {
    els.errorBanner.hidden = true;
  }

  function getExtension(name) {
    const parts = name.toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function getSaveName(job) {
    const raw = (job.customName || "").trim() || job.baseName;
    return raw.replace(/\.gif$/i, "") + ".gif";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatTime(seconds) {
    const total = Math.round(seconds);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return min + "분 " + String(sec).padStart(2, "0") + "초";
  }

  function even(value) {
    const number = Math.max(2, Math.round(value));
    return number % 2 === 0 ? number : number + 1;
  }

  function uniqueIndexes(list) {
    return list.filter(function (value, index) {
      return list.indexOf(value) === index;
    });
  }

  function sceneCaption(index, total) {
    const labels = ["시작 장면", "초반 장면", "핵심 장면", "후반 장면", "마무리 장면"];
    const ratio = total <= 1 ? 0 : index / (total - 1);
    if (ratio < 0.2) return labels[0];
    if (ratio < 0.4) return labels[1];
    if (ratio < 0.6) return labels[2];
    if (ratio < 0.8) return labels[3];
    return labels[4];
  }

  function seekVideo(video, time) {
    return new Promise(function (resolve, reject) {
      const finish = function () {
        video.removeEventListener("seeked", finish);
        video.removeEventListener("error", fail);
        requestAnimationFrame(function () {
          resolve();
        });
      };
      const fail = function () {
        video.removeEventListener("seeked", finish);
        video.removeEventListener("error", fail);
        reject(new Error("영상 프레임을 읽는 중 오류가 났습니다."));
      };
      video.addEventListener("seeked", finish);
      video.addEventListener("error", fail);
      video.currentTime = Math.max(0, time);
    });
  }

  function waitForEvent(element, type) {
    return new Promise(function (resolve, reject) {
      const ok = function () {
        element.removeEventListener(type, ok);
        element.removeEventListener("error", fail);
        resolve();
      };
      const fail = function () {
        element.removeEventListener(type, ok);
        element.removeEventListener("error", fail);
        reject(new Error("동영상을 열 수 없습니다."));
      };
      element.addEventListener(type, ok);
      element.addEventListener("error", fail);
    });
  }

  function waitIfPaused(job) {
    return new Promise(function (resolve) {
      const tick = function () {
        if (!job.paused) {
          resolve();
          return;
        }
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function makeWorkCanvas(outWidth, outHeight) {
    const width = even(Math.min(320, Math.max(160, Math.round(outWidth / 2))));
    const height = even(Math.max(90, Math.round(outHeight * (width / outWidth))));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return {
      canvas: canvas,
      ctx: canvas.getContext("2d", { willReadFrequently: true }),
      width: width,
      height: height
    };
  }

  async function drawVideoFrame(ctx, video, width, height) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(video);
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        return;
      } catch (error) {
        // fall through and draw the video element
      }
    }
    ctx.drawImage(video, 0, 0, width, height);
  }

  async function renderCartoonMovieFrame(ctx, work, video, width, height, t, frameIndex) {
    const zoom = 1.1 + 0.05 * Math.sin(t * Math.PI);
    const panX = Math.sin(t * 2.2) * 0.035;
    const panY = Math.cos(t * 1.6) * 0.025;
    const bounce = 1 + 0.012 * Math.sin(frameIndex * 0.4);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sw = vw / (zoom * bounce);
    const sh = vh / (zoom * bounce);
    const sx = clamp(0, vw - sw, (vw - sw) / 2 + panX * vw);
    const sy = clamp(0, vh - sh, (vh - sh) / 2 + panY * vh);

    work.ctx.fillStyle = "#1a1033";
    work.ctx.fillRect(0, 0, work.width, work.height);
    await drawVideoRegion(work.ctx, video, sx, sy, sw, sh, work.width, work.height);
    cartoonizeInPlace(work.ctx, work.width, work.height);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(work.canvas, 0, 0, width, height);
    paintTheaterLight(ctx, width, height, t, frameIndex);
  }

  async function drawVideoRegion(ctx, video, sx, sy, sw, sh, width, height) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(video);
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
        bitmap.close();
        return;
      } catch (error) {
        // fall through and draw the video element
      }
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  }

  function cartoonizeInPlace(ctx, width, height) {
    const image = ctx.getImageData(0, 0, width, height);
    const src = image.data;
    const count = width * height;
    const gray = new Uint8Array(count);
    const dest = new Uint8ClampedArray(src.length);

    for (let i = 0, p = 0; i < count; i += 1, p += 4) {
      gray[i] = (src[p] * 30 + src[p + 1] * 59 + src[p + 2] * 11) / 100;
    }

    blur3x3(src, dest, width, height);

    for (let p = 0; p < dest.length; p += 4) {
      const r = dest[p];
      const g = dest[p + 1];
      const b = dest[p + 2];
      if (isSkinTone(r, g, b)) {
        const skin = snapSkin(r, g, b);
        dest[p] = skin[0];
        dest[p + 1] = skin[1];
        dest[p + 2] = skin[2];
      } else {
        const hsl = rgbToHsl(r, g, b);
        hsl.s = Math.min(1, hsl.s * 1.55 + 0.14);
        hsl.l = snapLevels(hsl.l, 7);
        hsl.h = snapHue(hsl.h);
        const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        dest[p] = rgb.r;
        dest[p + 1] = rgb.g;
        dest[p + 2] = rgb.b;
      }
      dest[p + 3] = 255;
    }

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const gx =
          -gray[(y - 1) * width + (x - 1)] +
          gray[(y - 1) * width + (x + 1)] -
          2 * gray[y * width + (x - 1)] +
          2 * gray[y * width + (x + 1)] -
          gray[(y + 1) * width + (x - 1)] +
          gray[(y + 1) * width + (x + 1)];
        const gy =
          -gray[(y - 1) * width + (x - 1)] -
          2 * gray[(y - 1) * width + x] -
          gray[(y - 1) * width + (x + 1)] +
          gray[(y + 1) * width + (x - 1)] +
          2 * gray[(y + 1) * width + x] +
          gray[(y + 1) * width + (x + 1)];
        const mag = Math.abs(gx) + Math.abs(gy);
        if (mag > 118) {
          const p = (y * width + x) * 4;
          const ink = mag > 190 ? 18 : 36;
          dest[p] = ink;
          dest[p + 1] = ink;
          dest[p + 2] = ink;
        }
      }
    }

    image.data.set(dest);
    ctx.putImageData(image, 0, 0);
  }

  function blur3x3(src, dest, width, height) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const p = (yy * width + xx) * 4;
            r += src[p];
            g += src[p + 1];
            b += src[p + 2];
            n += 1;
          }
        }
        const q = (y * width + x) * 4;
        dest[q] = r / n;
        dest[q + 1] = g / n;
        dest[q + 2] = b / n;
        dest[q + 3] = 255;
      }
    }
  }

  function isSkinTone(r, g, b) {
    return r > 90 && g > 38 && b > 18 && r > g && r > b && r - g > 12 && r - b > 15;
  }

  function snapSkin(r, g, b) {
    const skins = [
      [255, 220, 190],
      [255, 196, 154],
      [240, 168, 118],
      [210, 138, 88],
      [168, 96, 58],
      [112, 68, 42]
    ];
    let best = skins[0];
    let score = Infinity;
    skins.forEach(function (skin) {
      const d = (skin[0] - r) * (skin[0] - r) + (skin[1] - g) * (skin[1] - g) + (skin[2] - b) * (skin[2] - b);
      if (d < score) {
        score = d;
        best = skin;
      }
    });
    return best;
  }

  function snapLevels(value, steps) {
    return (Math.round(value * (steps - 1)) + 0.18) / steps;
  }

  function snapHue(hue) {
    return Math.round(hue * 12) / 12;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    const d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    let r;
    let g;
    let b;
    if (!s) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function clamp(min, max, value) {
    return Math.min(max, Math.max(min, value));
  }

  function paintTheaterLight(ctx, width, height, t, frameIndex) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const spot = ctx.createRadialGradient(width * 0.5, height * 0.08, 16, width * 0.5, height * 0.4, width * 0.72);
    spot.addColorStop(0, "rgba(255, 232, 150, 0.55)");
    spot.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "screen";
    const rim = ctx.createLinearGradient(0, 0, width, 0);
    rim.addColorStop(0, "rgba(255, 90, 170, 0.12)");
    rim.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    rim.addColorStop(1, "rgba(80, 210, 255, 0.14)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    for (let n = 0; n < 6; n += 1) {
      const px = ((n * 0.17 + t * 0.4 + frameIndex * 0.002) % 1) * width;
      const py = (0.1 + Math.abs(Math.sin(t * 6 + n)) * 0.72) * height;
      const radius = 1.5 + (n % 3);
      const glow = ctx.createRadialGradient(px, py, 0, px, py, radius * 4);
      glow.addColorStop(0, "rgba(255, 250, 190, 0.35)");
      glow.addColorStop(1, "rgba(255, 140, 200, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, radius * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function playIcon() {
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M8 5v14l11-7z"/>' +
      "</svg>"
    );
  }

  function stopIcon() {
    return (
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<rect x="6" y="6" width="12" height="12" rx="2"/>' +
      "</svg>"
    );
  }

  function trashIcon() {
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M9 7V5h6v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M7 7l1 13h8l1-13" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
