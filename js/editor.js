(function () {
  "use strict";

  // 상태 관리 객체
  const state = {
    file: null,
    fileName: "",
    baseName: "",
    fileSize: 0,
    origWidth: 0,
    origHeight: 0,
    origFrames: [], // { canvas, delay }
    origBlobUrl: null,

    // 현재 활성화된 도구
    activeTool: null, // 'resize'|'crop'|'downsizing'|'convert'|'rotate'|'optimize'|'reverse'|'speed'|'cut'
    isProcessing: false,

    // 실시간 프리뷰 루프 관련
    previewAnimId: null,
    previewFrameIdx: 0,
    previewLastTime: 0,

    // 최종 결과물 관련
    resultBlob: null,
    resultBlobUrl: null,
    resultMime: "image/gif",
    resultExt: "gif",
    resultName: "",

    // 1. Resize 상태
    resize: {
      width: 0,
      height: 0,
      isLocked: true,
      ratio: 1
    },

    // 2. Crop 상태
    crop: {
      aspect: "1:1", // '1:1', '4:3', '16:9', '9:16', '3:2'
      fillMode: "contain", // 'contain' (단색 여백), 'cover' (그림 확대)
      bgColor: "#ffffff"
    },

    // 3. Downsizing 상태
    downsizing: {
      scale: true,
      dropFrames: true,
      reduceQuality: true
    },

    // 4. Convert 상태
    convert: {
      format: "mp4" // 'mp4' | 'jpg'
    },

    // 5. Rotate 상태
    rotate: {
      deg: 0, // 0, 90, 180, 270
      flipH: false,
      flipV: false
    },

    // 6. Optimize 상태
    optimize: {
      mode: "smart" // 'smart' | 'light'
    },

    // 7. Reverse 상태
    reverse: {
      mode: "true" // 'true' (역재생), 'pingpong' (왕복)
    },

    // 8. Speed 상태
    speed: {
      rate: 1.0 // 0.25 ~ 3.0
    },

    // 9. Cut 상태
    cut: {
      start: 1,
      end: 1
    }
  };

  // 9개 도구 목록 메타데이터
  const TOOLS = [
    { id: "resize", name: "Resize", icon: "📐", title: "Resize (크기 조절)" },
    { id: "crop", name: "Crop", icon: "✂️", title: "Crop (비율 자르기 & 여백 채우기)" },
    { id: "downsizing", name: "Downsizing", icon: "📉", title: "Downsizing (용량 다이어트)" },
    { id: "convert", name: "Format Convert", icon: "🔄", title: "Format Convert (MP4 / JPG 변환)" },
    { id: "rotate", name: "Rotate", icon: "🔁", title: "Rotate & Flip (회전 및 반전)" },
    { id: "optimize", name: "Optimize", icon: "⚡", title: "Optimize (화질 유지 최적화)" },
    { id: "reverse", name: "Reverse", icon: "◀️", title: "Reverse (역재생 & 왕복)" },
    { id: "speed", name: "Speed", icon: "⏱️", title: "Speed (재생 속도 조절)" },
    { id: "cut", name: "Cut", icon: "🎞️", title: "Cut (구간 자르기)" }
  ];

  // DOM 캐싱
  const els = {
    // 탭
    tabMaker: document.getElementById("tabMaker"),
    tabEditor: document.getElementById("tabEditor"),
    makerView: document.getElementById("makerView"),
    editorView: document.getElementById("editorView"),

    // 업로드 & 에러
    editorInitialWrap: document.getElementById("editorInitialWrap"),
    editorDropzone: document.getElementById("editorDropzone"),
    editorFileInput: document.getElementById("editorFileInput"),
    editorPickBtn: document.getElementById("editorPickBtn"),
    editorErrorBanner: document.getElementById("editorErrorBanner"),
    editorErrorMessage: document.getElementById("editorErrorMessage"),

    // 워크스페이스
    editorWorkspace: document.getElementById("editorWorkspace"),

    // 왼쪽 원본 카드
    originalCard: document.getElementById("originalCard"),
    origFoldBtn: document.getElementById("origFoldBtn"),
    origCardBody: document.getElementById("origCardBody"),
    origImg: document.getElementById("origImg"),
    origInfoGrid: document.getElementById("origInfoGrid"),

    // 왼쪽 결과 카드
    resultCard: document.getElementById("resultCard"),
    resultCardTitle: document.getElementById("resultCardTitle"),
    resultFoldBtn: document.getElementById("resultFoldBtn"),
    resultCardBody: document.getElementById("resultCardBody"),
    resultPreviewWrap: document.getElementById("resultPreviewWrap"),
    resultInfoGrid: document.getElementById("resultInfoGrid"),
    saveResultBtn: document.getElementById("saveResultBtn"),

    // 오른쪽 도구 카드
    toolsCardTitle: document.getElementById("toolsCardTitle"),
    toolsGrid: document.getElementById("toolsGrid"),
    toolDetailContainer: document.getElementById("toolDetailContainer"),
    livePreviewCanvas: document.getElementById("livePreviewCanvas"),
    livePreviewNote: document.getElementById("livePreviewNote"),

    // 서브패널들
    panelResize: document.getElementById("panelResize"),
    panelCrop: document.getElementById("panelCrop"),
    panelDownsizing: document.getElementById("panelDownsizing"),
    panelConvert: document.getElementById("panelConvert"),
    panelRotate: document.getElementById("panelRotate"),
    panelOptimize: document.getElementById("panelOptimize"),
    panelReverse: document.getElementById("panelReverse"),
    panelSpeed: document.getElementById("panelSpeed"),
    panelCut: document.getElementById("panelCut"),

    // 공통 버튼 & 프로그레스
    toolBackBtn: document.getElementById("toolBackBtn"),
    toolGoBtn: document.getElementById("toolGoBtn"),
    toolProgress: document.getElementById("toolProgress"),
    toolProgressBarInner: document.getElementById("toolProgressBarInner"),
    toolProgressText: document.getElementById("toolProgressText"),

    // 1. Resize 엘리먼트
    rangeResizeW: document.getElementById("rangeResizeW"),
    valResizeW: document.getElementById("valResizeW"),
    pctResizeW: document.getElementById("pctResizeW"),
    rangeResizeH: document.getElementById("rangeResizeH"),
    valResizeH: document.getElementById("valResizeH"),
    pctResizeH: document.getElementById("pctResizeH"),
    lockResizeBtn: document.getElementById("lockResizeBtn"),
    lockResizeIcon: document.getElementById("lockResizeIcon"),
    lockResizeText: document.getElementById("lockResizeText"),

    // 2. Crop 엘리먼트
    cropAspectGroup: document.getElementById("cropAspectGroup"),
    cropFillGroup: document.getElementById("cropFillGroup"),
    cropColorRow: document.getElementById("cropColorRow"),
    cropBgColor: document.getElementById("cropBgColor"),

    // 3. Downsizing 엘리먼트
    downOptScale: document.getElementById("downOptScale"),
    downOptFrames: document.getElementById("downOptFrames"),
    downOptQuality: document.getElementById("downOptQuality"),

    // 4. Convert 엘리먼트
    convertFormatGroup: document.getElementById("convertFormatGroup"),

    // 5. Rotate 엘리먼트
    rotateDegGroup: document.getElementById("rotateDegGroup"),
    flipHBtn: document.getElementById("flipHBtn"),
    flipVBtn: document.getElementById("flipVBtn"),

    // 6. Optimize 엘리먼트
    optModeGroup: document.getElementById("optModeGroup"),

    // 7. Reverse 엘리먼트
    reverseModeGroup: document.getElementById("reverseModeGroup"),

    // 8. Speed 엘리먼트
    rangeSpeed: document.getElementById("rangeSpeed"),
    valSpeed: document.getElementById("valSpeed"),
    speedPresets: document.getElementById("speedPresets"),

    // 9. Cut 엘리먼트
    rangeCutStart: document.getElementById("rangeCutStart"),
    rangeCutEnd: document.getElementById("rangeCutEnd"),
    valCutStart: document.getElementById("valCutStart"),
    valCutEnd: document.getElementById("valCutEnd"),
    valCutTotal: document.getElementById("valCutTotal")
  };

  init();

  function init() {
    bindTabs();
    bindUpload();
    bindFold();
    bindToolsNavigation();
    bindAllToolControls();
    bindCommonAction();
    bindSavePicker();
  }

  // 1. 탭 네비게이션
  function bindTabs() {
    els.tabMaker.addEventListener("click", () => switchTab("maker"));
    els.tabEditor.addEventListener("click", () => switchTab("editor"));
  }

  function switchTab(mode) {
    if (mode === "maker") {
      els.tabMaker.classList.add("active");
      els.tabEditor.classList.remove("active");
      els.makerView.hidden = false;
      els.editorView.hidden = true;
    } else {
      els.tabEditor.classList.add("active");
      els.tabMaker.classList.remove("active");
      els.makerView.hidden = true;
      els.editorView.hidden = false;
    }
  }

  // 2. 업로드 & 드래그앤드롭
  function bindUpload() {
    els.editorPickBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.editorFileInput.click();
    });

    els.editorDropzone.addEventListener("click", () => {
      els.editorFileInput.click();
    });

    els.editorFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleIncomingFile(file);
      els.editorFileInput.value = "";
    });

    ["dragenter", "dragover"].forEach((type) => {
      els.editorDropzone.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.editorDropzone.classList.add("dragover");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((type) => {
      els.editorDropzone.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.editorDropzone.classList.remove("dragover");
      });
    });

    els.editorDropzone.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      handleIncomingFile(files[0]);
    });
  }

  function handleIncomingFile(file) {
    hideEditorError();
    const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
    if (!isGif) {
      showEditorError("선택하신 파일은 편집할 수 없는 파일입니다.<br><strong>GIF 파일(.gif)만 편집할 수 있습니다.</strong>");
      return;
    }

    state.file = file;
    state.fileName = file.name;
    state.baseName = file.name.replace(/\.[^/.]+$/, "");
    state.fileSize = file.size;

    if (state.origBlobUrl) URL.revokeObjectURL(state.origBlobUrl);
    state.origBlobUrl = URL.createObjectURL(file);

    parseGif(file);
  }

  function showEditorError(html) {
    els.editorErrorMessage.innerHTML = html;
    els.editorErrorBanner.hidden = false;
  }

  function hideEditorError() {
    els.editorErrorBanner.hidden = true;
    els.editorErrorMessage.innerHTML = "";
  }

  // GIF 디코딩 (omggif)
  function parseGif(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const buffer = new Uint8Array(e.target.result);
        const gifReader = new GifReader(buffer);

        state.origWidth = gifReader.width;
        state.origHeight = gifReader.height;
        state.resize.ratio = gifReader.width / gifReader.height;

        const numFrames = gifReader.numFrames();
        const frames = [];

        const canvas = document.createElement("canvas");
        canvas.width = gifReader.width;
        canvas.height = gifReader.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const accCanvas = document.createElement("canvas");
        accCanvas.width = gifReader.width;
        accCanvas.height = gifReader.height;
        const accCtx = accCanvas.getContext("2d", { willReadFrequently: true });

        for (let i = 0; i < numFrames; i++) {
          const frameInfo = gifReader.frameInfo(i);
          const frameImageData = ctx.createImageData(frameInfo.width, frameInfo.height);
          gifReader.decodeAndBlitFrameRGBA(i, frameImageData.data);

          const frameCanvas = document.createElement("canvas");
          frameCanvas.width = gifReader.width;
          frameCanvas.height = gifReader.height;
          const frameCtx = frameCanvas.getContext("2d");

          frameCtx.drawImage(accCanvas, 0, 0);

          const patchCanvas = document.createElement("canvas");
          patchCanvas.width = frameInfo.width;
          patchCanvas.height = frameInfo.height;
          patchCanvas.getContext("2d").putImageData(frameImageData, 0, 0);
          frameCtx.drawImage(patchCanvas, frameInfo.x, frameInfo.y);

          if (frameInfo.disposal === 2) {
            accCtx.clearRect(frameInfo.x, frameInfo.y, frameInfo.width, frameInfo.height);
          } else if (frameInfo.disposal !== 3) {
            accCtx.drawImage(frameCanvas, 0, 0);
          }

          const delay = Math.max(frameInfo.delay ? frameInfo.delay * 10 : 100, 20);
          frames.push({ canvas: frameCanvas, delay });
        }

        state.origFrames = frames;

        // 화면 전환
        setupWorkspace();
      } catch (err) {
        console.error("GIF 파싱 에러:", err);
        showEditorError("GIF 파일을 해석하는 도중 오류가 발생했습니다.<br>손상되지 않은 올바른 GIF 파일을 선택해 주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function setupWorkspace() {
    els.editorInitialWrap.hidden = true;
    els.editorErrorBanner.hidden = true;
    els.editorWorkspace.hidden = false;

    // 원본 카드 세팅
    els.originalCard.hidden = false;
    els.origCardBody.classList.remove("collapsed");
    els.origFoldBtn.textContent = "▼";
    els.origImg.src = state.origBlobUrl;

    renderOriginalInfo();

    // 결과 카드 초기 숨김
    els.resultCard.hidden = true;

    // 도구 메뉴 노출
    showToolsMenu();
  }

  function renderOriginalInfo() {
    els.origInfoGrid.innerHTML = `
      <div class="info-label">파일명</div>
      <div class="info-value">${escapeHtml(state.fileName)}</div>
      <div class="info-label">해상도</div>
      <div class="info-value">${state.origWidth} × ${state.origHeight} px</div>
      <div class="info-label">파일 크기</div>
      <div class="info-value">${formatBytes(state.fileSize)}</div>
      <div class="info-label">프레임 수</div>
      <div class="info-value">${state.origFrames.length} 프레임</div>
    `;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // 3. 접기/펼치기
  function bindFold() {
    els.origFoldBtn.addEventListener("click", () => {
      const isCollapsed = els.origCardBody.classList.toggle("collapsed");
      els.origFoldBtn.textContent = isCollapsed ? "▶" : "▼";
    });

    els.resultFoldBtn.addEventListener("click", () => {
      const isCollapsed = els.resultCardBody.classList.toggle("collapsed");
      els.resultFoldBtn.textContent = isCollapsed ? "▶" : "▼";
    });
  }

  // 4. 9개 도구 탐색 및 메뉴
  function bindToolsNavigation() {
    els.toolsGrid.innerHTML = TOOLS.map(t => `
      <button type="button" class="tool-btn" data-tool="${t.id}">
        <span class="tool-icon">${t.icon}</span>
        <span class="tool-name">${t.name}</span>
      </button>
    `).join("");

    els.toolsGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".tool-btn");
      if (!btn) return;
      openTool(btn.getAttribute("data-tool"));
    });

    els.toolBackBtn.addEventListener("click", showToolsMenu);
  }

  function showToolsMenu() {
    stopLivePreview();
    state.activeTool = null;
    els.toolsCardTitle.textContent = "편집 도구 (Tools)";
    els.toolsGrid.hidden = false;
    els.toolDetailContainer.hidden = true;
    els.toolProgress.hidden = true;
  }

  function openTool(toolId) {
    state.activeTool = toolId;
    const tool = TOOLS.find(t => t.id === toolId);
    els.toolsCardTitle.textContent = tool ? tool.title : "편집 도구";
    els.toolsGrid.hidden = true;
    els.toolDetailContainer.hidden = false;
    els.toolProgress.hidden = true;
    els.toolGoBtn.disabled = false;

    // 모든 서브패널 숨김
    const panels = [
      els.panelResize, els.panelCrop, els.panelDownsizing,
      els.panelConvert, els.panelRotate, els.panelOptimize,
      els.panelReverse, els.panelSpeed, els.panelCut
    ];
    panels.forEach(p => p.hidden = true);

    // 해당 패널 초기화 및 표시
    if (toolId === "resize") {
      initResizePanel();
      els.panelResize.hidden = false;
    } else if (toolId === "crop") {
      els.panelCrop.hidden = false;
    } else if (toolId === "downsizing") {
      els.panelDownsizing.hidden = false;
    } else if (toolId === "convert") {
      els.panelConvert.hidden = false;
    } else if (toolId === "rotate") {
      els.panelRotate.hidden = false;
    } else if (toolId === "optimize") {
      els.panelOptimize.hidden = false;
    } else if (toolId === "reverse") {
      els.panelReverse.hidden = false;
    } else if (toolId === "speed") {
      els.panelSpeed.hidden = false;
    } else if (toolId === "cut") {
      initCutPanel();
      els.panelCut.hidden = false;
    }

    startLivePreview();
  }

  // 5. 각 도구별 컨트롤 이벤트 및 초기화
  function bindAllToolControls() {
    // 1. Resize
    bindResizeControls();
    // 2. Crop
    bindCropControls();
    // 3. Downsizing
    bindDownsizingControls();
    // 4. Convert
    bindConvertControls();
    // 5. Rotate
    bindRotateControls();
    // 6. Optimize
    bindOptimizeControls();
    // 7. Reverse
    bindReverseControls();
    // 8. Speed
    bindSpeedControls();
    // 9. Cut
    bindCutControls();
  }

  // --- Resize ---
  function initResizePanel() {
    const minW = Math.max(1, Math.round(state.origWidth * 0.05));
    const maxW = Math.round(state.origWidth * 3.0);
    const minH = Math.max(1, Math.round(state.origHeight * 0.05));
    const maxH = Math.round(state.origHeight * 3.0);

    els.rangeResizeW.min = minW;
    els.rangeResizeW.max = maxW;
    els.rangeResizeW.value = state.origWidth;

    els.rangeResizeH.min = minH;
    els.rangeResizeH.max = maxH;
    els.rangeResizeH.value = state.origHeight;

    state.resize.width = state.origWidth;
    state.resize.height = state.origHeight;
    state.resize.isLocked = true;
    updateResizeLabels();
    updateLockResizeUi();
  }

  function bindResizeControls() {
    els.lockResizeBtn.addEventListener("click", () => {
      state.resize.isLocked = !state.resize.isLocked;
      updateLockResizeUi();
    });

    els.rangeResizeW.addEventListener("input", (e) => {
      const w = parseInt(e.target.value, 10);
      state.resize.width = w;
      if (state.resize.isLocked) {
        state.resize.height = Math.round(w / state.resize.ratio);
        els.rangeResizeH.value = state.resize.height;
      }
      updateResizeLabels();
    });

    els.rangeResizeH.addEventListener("input", (e) => {
      const h = parseInt(e.target.value, 10);
      state.resize.height = h;
      if (state.resize.isLocked) {
        state.resize.width = Math.round(h * state.resize.ratio);
        els.rangeResizeW.value = state.resize.width;
      }
      updateResizeLabels();
    });
  }

  function updateResizeLabels() {
    els.valResizeW.textContent = state.resize.width;
    els.pctResizeW.textContent = Math.round((state.resize.width / state.origWidth) * 100) + "%";
    els.valResizeH.textContent = state.resize.height;
    els.pctResizeH.textContent = Math.round((state.resize.height / state.origHeight) * 100) + "%";
  }

  function updateLockResizeUi() {
    if (state.resize.isLocked) {
      els.lockResizeBtn.classList.remove("unlocked");
      els.lockResizeIcon.textContent = "🔒";
      els.lockResizeText.textContent = "비율 고정됨";
    } else {
      els.lockResizeBtn.classList.add("unlocked");
      els.lockResizeIcon.textContent = "🔓";
      els.lockResizeText.textContent = "자유 비율";
    }
  }

  // --- Crop ---
  function bindCropControls() {
    els.cropAspectGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.cropAspectGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.crop.aspect = btn.getAttribute("data-aspect");
    });

    els.cropFillGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.cropFillGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.crop.fillMode = btn.getAttribute("data-mode");
      els.cropColorRow.style.display = state.crop.fillMode === "contain" ? "flex" : "none";
    });

    els.cropBgColor.addEventListener("input", (e) => {
      state.crop.bgColor = e.target.value;
    });
  }

  // --- Downsizing ---
  function bindDownsizingControls() {
    els.downOptScale.addEventListener("change", (e) => {
      state.downsizing.scale = e.target.checked;
    });
    els.downOptFrames.addEventListener("change", (e) => {
      state.downsizing.dropFrames = e.target.checked;
    });
    els.downOptQuality.addEventListener("change", (e) => {
      state.downsizing.reduceQuality = e.target.checked;
    });
  }

  // --- Convert ---
  function bindConvertControls() {
    els.convertFormatGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.convertFormatGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.convert.format = btn.getAttribute("data-fmt");
    });
  }

  // --- Rotate ---
  function bindRotateControls() {
    els.rotateDegGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.rotateDegGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.rotate.deg = parseInt(btn.getAttribute("data-deg"), 10);
    });

    els.flipHBtn.addEventListener("click", () => {
      state.rotate.flipH = !state.rotate.flipH;
      els.flipHBtn.classList.toggle("active", state.rotate.flipH);
    });

    els.flipVBtn.addEventListener("click", () => {
      state.rotate.flipV = !state.rotate.flipV;
      els.flipVBtn.classList.toggle("active", state.rotate.flipV);
    });
  }

  // --- Optimize ---
  function bindOptimizeControls() {
    els.optModeGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.optModeGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.optimize.mode = btn.getAttribute("data-opt");
    });
  }

  // --- Reverse ---
  function bindReverseControls() {
    els.reverseModeGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.reverseModeGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.reverse.mode = btn.getAttribute("data-rev");
    });
  }

  // --- Speed ---
  function bindSpeedControls() {
    els.rangeSpeed.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      state.speed.rate = val;
      els.valSpeed.textContent = `${val.toFixed(2)}x`;
      syncSpeedPresetActive(val);
    });

    els.speedPresets.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      const spd = parseFloat(btn.getAttribute("data-spd"));
      state.speed.rate = spd;
      els.rangeSpeed.value = spd;
      els.valSpeed.textContent = `${spd.toFixed(2)}x`;
      syncSpeedPresetActive(spd);
    });
  }

  function syncSpeedPresetActive(val) {
    els.speedPresets.querySelectorAll(".btn-choice").forEach(b => {
      b.classList.toggle("active", Math.abs(parseFloat(b.getAttribute("data-spd")) - val) < 0.05);
    });
  }

  // --- Cut ---
  function initCutPanel() {
    const total = state.origFrames.length;
    els.rangeCutStart.min = 1;
    els.rangeCutStart.max = total;
    els.rangeCutStart.value = 1;

    els.rangeCutEnd.min = 1;
    els.rangeCutEnd.max = total;
    els.rangeCutEnd.value = total;

    state.cut.start = 1;
    state.cut.end = total;
    updateCutLabels();
  }

  function bindCutControls() {
    els.rangeCutStart.addEventListener("input", (e) => {
      let s = parseInt(e.target.value, 10);
      if (s > state.cut.end) {
        state.cut.end = s;
        els.rangeCutEnd.value = s;
      }
      state.cut.start = s;
      updateCutLabels();
    });

    els.rangeCutEnd.addEventListener("input", (e) => {
      let ed = parseInt(e.target.value, 10);
      if (ed < state.cut.start) {
        state.cut.start = ed;
        els.rangeCutStart.value = ed;
      }
      state.cut.end = ed;
      updateCutLabels();
    });
  }

  function updateCutLabels() {
    const total = state.origFrames.length;
    els.valCutStart.textContent = `${state.cut.start} / ${total}`;
    els.valCutEnd.textContent = `${state.cut.end} / ${total}`;
    els.valCutTotal.textContent = (state.cut.end - state.cut.start + 1);
  }

  // 6. 실시간 미리보기 (Live Preview Loop)
  function startLivePreview() {
    stopLivePreview();
    state.previewFrameIdx = 0;
    state.previewLastTime = performance.now();

    function loop(now) {
      if (!state.activeTool || !state.origFrames.length) return;

      // 현재 편집 모드에 따른 시퀀스 및 딜레이 계산
      const activeFrames = getProcessedSequencePreview();
      if (activeFrames.length > 0) {
        const cur = activeFrames[state.previewFrameIdx % activeFrames.length];
        const delay = cur.delay / (state.activeTool === "speed" ? state.speed.rate : 1.0);

        if (now - state.previewLastTime >= delay) {
          state.previewFrameIdx = (state.previewFrameIdx + 1) % activeFrames.length;
          state.previewLastTime = now;
        }

        renderLiveFrame(cur.canvas);
      }

      state.previewAnimId = requestAnimationFrame(loop);
    }

    state.previewAnimId = requestAnimationFrame(loop);
  }

  function stopLivePreview() {
    if (state.previewAnimId) {
      cancelAnimationFrame(state.previewAnimId);
      state.previewAnimId = null;
    }
  }

  // 실시간 프리뷰 프레임 시퀀스 (Cut, Reverse, Downsizing 건너뛰기 반영)
  function getProcessedSequencePreview() {
    let list = state.origFrames;

    // Cut 적용
    if (state.activeTool === "cut") {
      const s = state.cut.start - 1;
      const e = state.cut.end;
      list = list.slice(s, e);
    }

    // Downsizing의 프레임 빼기
    if (state.activeTool === "downsizing" && state.downsizing.dropFrames) {
      list = list.filter((_, idx) => idx % 2 === 0);
    }

    // Reverse 적용
    if (state.activeTool === "reverse") {
      if (state.reverse.mode === "true") {
        list = [...list].reverse();
      } else if (state.reverse.mode === "pingpong") {
        const rev = [...list].reverse().slice(1, -1);
        list = list.concat(rev);
      }
    }

    return list.length ? list : state.origFrames;
  }

  // 실시간 캔버스 1프레임 렌더링 (Resize, Crop, Rotate 등 변형 적용)
  function renderLiveFrame(sourceCanvas) {
    const pCanvas = els.livePreviewCanvas;
    const pCtx = pCanvas.getContext("2d");

    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;

    // 도구별 타겟 캔버스 규격 계산
    let dw = sw;
    let dh = sh;

    if (state.activeTool === "resize") {
      dw = state.resize.width;
      dh = state.resize.height;
    } else if (state.activeTool === "crop") {
      const [aw, ah] = state.crop.aspect.split(":").map(Number);
      const targetRatio = aw / ah;
      // 가로 기준 박스
      dw = sw;
      dh = Math.round(sw / targetRatio);
    } else if (state.activeTool === "downsizing" && state.downsizing.scale) {
      dw = Math.round(sw * 0.75);
      dh = Math.round(sh * 0.75);
    } else if (state.activeTool === "rotate") {
      const deg = state.rotate.deg;
      if (deg === 90 || deg === 270) {
        dw = sh;
        dh = sw;
      }
    }

    if (pCanvas.width !== dw || pCanvas.height !== dh) {
      pCanvas.width = dw;
      pCanvas.height = dh;
    }

    pCtx.clearRect(0, 0, dw, dh);

    // 1. Crop 렌더링
    if (state.activeTool === "crop") {
      if (state.crop.fillMode === "contain") {
        pCtx.fillStyle = state.crop.bgColor;
        pCtx.fillRect(0, 0, dw, dh);
        // 중앙 맞춤 contain
        const sRatio = sw / sh;
        const dRatio = dw / dh;
        let rw = dw, rh = dh, rx = 0, ry = 0;
        if (sRatio > dRatio) {
          rh = dw / sRatio;
          ry = (dh - rh) / 2;
        } else {
          rw = dh * sRatio;
          rx = (dw - rw) / 2;
        }
        pCtx.drawImage(sourceCanvas, rx, ry, rw, rh);
      } else {
        // cover (꽉 채우기)
        const sRatio = sw / sh;
        const dRatio = dw / dh;
        let sx = 0, sy = 0, sw_crop = sw, sh_crop = sh;
        if (sRatio > dRatio) {
          sw_crop = sh * dRatio;
          sx = (sw - sw_crop) / 2;
        } else {
          sh_crop = sw / dRatio;
          sy = (sh - sh_crop) / 2;
        }
        pCtx.drawImage(sourceCanvas, sx, sy, sw_crop, sh_crop, 0, 0, dw, dh);
      }
      return;
    }

    // 2. Rotate & Flip 렌더링
    if (state.activeTool === "rotate") {
      pCtx.save();
      pCtx.translate(dw / 2, dh / 2);
      pCtx.rotate((state.rotate.deg * Math.PI) / 180);
      pCtx.scale(state.rotate.flipH ? -1 : 1, state.rotate.flipV ? -1 : 1);
      pCtx.drawImage(sourceCanvas, -sw / 2, -sh / 2, sw, sh);
      pCtx.restore();
      return;
    }

    // 기본 스케일 렌더링 (Resize, Downsizing, Speed, Optimize 등)
    pCtx.imageSmoothingEnabled = true;
    pCtx.imageSmoothingQuality = "high";
    pCtx.drawImage(sourceCanvas, 0, 0, dw, dh);
  }

  // 7. <Go!> 실행 버튼 & 도구별 엔진
  function bindCommonAction() {
    els.toolGoBtn.addEventListener("click", () => {
      if (state.isProcessing || !state.origFrames.length) return;
      executeCurrentTool();
    });
  }

  function executeCurrentTool() {
    const tool = state.activeTool;
    state.isProcessing = true;
    els.toolGoBtn.disabled = true;
    els.toolProgress.hidden = false;
    updateProgress(0, "작업 시작 중...");

    if (tool === "convert") {
      if (state.convert.format === "jpg") {
        executeConvertJpg();
      } else {
        executeConvertMp4();
      }
    } else {
      executeGifGeneration(tool);
    }
  }

  // GIF 생성 파이프라인 (Resize, Crop, Downsizing, Rotate, Optimize, Reverse, Speed, Cut 공통)
  function executeGifGeneration(tool) {
    // 1. 프레임 시퀀스 추출
    let frameList = state.origFrames;

    if (tool === "cut") {
      frameList = frameList.slice(state.cut.start - 1, state.cut.end);
    }

    if (tool === "downsizing" && state.downsizing.dropFrames) {
      frameList = frameList.filter((_, idx) => idx % 2 === 0);
    }

    if (tool === "reverse") {
      if (state.reverse.mode === "true") {
        frameList = [...frameList].reverse();
      } else if (state.reverse.mode === "pingpong") {
        const rev = [...frameList].reverse().slice(1, -1);
        frameList = frameList.concat(rev);
      }
    }

    // 2. 출력 치수 결정
    const firstCanvas = frameList[0].canvas;
    const sw = firstCanvas.width;
    const sh = firstCanvas.height;
    let outW = sw;
    let outH = sh;

    if (tool === "resize") {
      outW = state.resize.width;
      outH = state.resize.height;
    } else if (tool === "crop") {
      const [aw, ah] = state.crop.aspect.split(":").map(Number);
      outW = sw;
      outH = Math.round(sw / (aw / ah));
    } else if (tool === "downsizing" && state.downsizing.scale) {
      outW = Math.round(sw * 0.75);
      outH = Math.round(sh * 0.75);
    } else if (tool === "rotate") {
      if (state.rotate.deg === 90 || state.rotate.deg === 270) {
        outW = sh;
        outH = sw;
      }
    }

    // 3. 인코더 옵션 결정
    let quality = 10;
    if (tool === "downsizing" && state.downsizing.reduceQuality) {
      quality = 24; // 높은 값일수록 압축률 높고 화질 낮아짐
    } else if (tool === "optimize") {
      quality = state.optimize.mode === "smart" ? 12 : 8;
    }

    // Worker Script URL
    let workerUrl = "lib/gif.worker.js";
    if (window.GIF_WORKER_SOURCE) {
      workerUrl = URL.createObjectURL(
        new Blob([window.GIF_WORKER_SOURCE], { type: "application/javascript" })
      );
    }

    const gif = new GIF({
      workers: 2,
      quality: quality,
      width: outW,
      height: outH,
      workerScript: workerUrl
    });

    // 4. 프레임 렌더링 및 gif 추가
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = outW;
    tempCanvas.height = outH;
    const tCtx = tempCanvas.getContext("2d");

    const total = frameList.length;
    for (let i = 0; i < total; i++) {
      const f = frameList[i];
      tCtx.clearRect(0, 0, outW, outH);

      if (tool === "crop") {
        if (state.crop.fillMode === "contain") {
          tCtx.fillStyle = state.crop.bgColor;
          tCtx.fillRect(0, 0, outW, outH);
          const sRatio = sw / sh;
          const dRatio = outW / outH;
          let rw = outW, rh = outH, rx = 0, ry = 0;
          if (sRatio > dRatio) {
            rh = outW / sRatio;
            ry = (outH - rh) / 2;
          } else {
            rw = outH * sRatio;
            rx = (outW - rw) / 2;
          }
          tCtx.drawImage(f.canvas, rx, ry, rw, rh);
        } else {
          const sRatio = sw / sh;
          const dRatio = outW / outH;
          let sx = 0, sy = 0, sw_crop = sw, sh_crop = sh;
          if (sRatio > dRatio) {
            sw_crop = sh * dRatio;
            sx = (sw - sw_crop) / 2;
          } else {
            sh_crop = sw / dRatio;
            sy = (sh - sh_crop) / 2;
          }
          tCtx.drawImage(f.canvas, sx, sy, sw_crop, sh_crop, 0, 0, outW, outH);
        }
      } else if (tool === "rotate") {
        tCtx.save();
        tCtx.translate(outW / 2, outH / 2);
        tCtx.rotate((state.rotate.deg * Math.PI) / 180);
        tCtx.scale(state.rotate.flipH ? -1 : 1, state.rotate.flipV ? -1 : 1);
        tCtx.drawImage(f.canvas, -sw / 2, -sh / 2, sw, sh);
        tCtx.restore();
      } else {
        tCtx.imageSmoothingEnabled = true;
        tCtx.imageSmoothingQuality = "high";
        tCtx.drawImage(f.canvas, 0, 0, outW, outH);
      }

      // 속도 조절 딜레이 반영
      let delay = f.delay;
      if (tool === "speed") {
        delay = Math.max(20, Math.round(f.delay / state.speed.rate));
      }

      gif.addFrame(tCtx, { copy: true, delay });
    }

    gif.on("progress", function (p) {
      const pct = Math.round(p * 100);
      updateProgress(pct, `GIF 인코딩 및 처리 중... (${pct}%)`);
    });

    gif.on("finished", function (blob) {
      completeProcess(blob, "image/gif", "gif", outW, outH, total, tool);
    });

    gif.render();
  }

  // JPG 변환 (대표 컷 고화질 추출)
  function executeConvertJpg() {
    updateProgress(50, "JPG 이미지 추출 중...");
    setTimeout(() => {
      const frame = state.origFrames[0].canvas;
      frame.toBlob((blob) => {
        completeProcess(blob, "image/jpeg", "jpg", frame.width, frame.height, 1, "convert_jpg");
      }, "image/jpeg", 0.95);
    }, 150);
  }

  // MP4 비디오 변환 (MediaRecorder 지원)
  function executeConvertMp4() {
    updateProgress(20, "비디오 변환 녹화 준비 중...");

    const sw = state.origWidth;
    const sh = state.origHeight;
    const vCanvas = document.createElement("canvas");
    vCanvas.width = sw;
    vCanvas.height = sh;
    const vCtx = vCanvas.getContext("2d");

    // 지원 마임타입 감지 (mp4 우선, 지원 안되면 webm fallback)
    let mime = "video/mp4";
    let ext = "mp4";
    if (!MediaRecorder.isTypeSupported("video/mp4")) {
      if (MediaRecorder.isTypeSupported("video/webm;codecs=h264")) {
        mime = "video/webm;codecs=h264";
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        mime = "video/webm";
      }
    }

    const stream = vCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      completeProcess(blob, mime, ext, sw, sh, state.origFrames.length, "convert_mp4");
    };

    recorder.start();

    // 프레임 순차 드로잉 재생 (총 루프 1회)
    let idx = 0;
    const total = state.origFrames.length;

    function playNext() {
      if (idx >= total) {
        setTimeout(() => recorder.stop(), 200);
        return;
      }
      const cur = state.origFrames[idx];
      vCtx.clearRect(0, 0, sw, sh);
      vCtx.drawImage(cur.canvas, 0, 0);

      const pct = Math.round((idx / total) * 100);
      updateProgress(pct, `비디오 변환 중... (${pct}%)`);

      idx++;
      setTimeout(playNext, cur.delay);
    }

    playNext();
  }

  function updateProgress(pct, text) {
    els.toolProgressBarInner.style.width = pct + "%";
    els.toolProgressText.textContent = text;
  }

  // 8. 작업 완료 및 왼쪽 결과 창 표시
  function completeProcess(blob, mime, ext, width, height, frameCount, toolType) {
    state.isProcessing = false;
    els.toolGoBtn.disabled = false;
    els.toolProgress.hidden = true;

    // 1. 왼쪽에 있던 <Original GIF> 창은 자동으로 닫힘
    els.origCardBody.classList.add("collapsed");
    els.origFoldBtn.textContent = "▶";

    // 2. 결과 저장
    state.resultBlob = blob;
    state.resultMime = mime;
    state.resultExt = ext;
    // 기본 파일 이름: 원래파일이름_ed.확장자
    state.resultName = `${state.baseName}_ed.${ext}`;

    if (state.resultBlobUrl) URL.revokeObjectURL(state.resultBlobUrl);
    state.resultBlobUrl = URL.createObjectURL(blob);

    // 3. 결과 창 업데이트
    const toolTitle = TOOLS.find(t => t.id === state.activeTool)?.name || "Result";
    els.resultCardTitle.textContent = `<${toolTitle} Result>`;
    els.resultCard.hidden = false;
    els.resultCardBody.classList.remove("collapsed");
    els.resultFoldBtn.textContent = "▼";

    // 미리보기 렌더링 (비디오 또는 이미지)
    els.resultPreviewWrap.innerHTML = "";
    if (ext === "mp4" || ext === "webm") {
      const video = document.createElement("video");
      video.src = state.resultBlobUrl;
      video.controls = true;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      els.resultPreviewWrap.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = state.resultBlobUrl;
      img.alt = "결과 미리보기";
      els.resultPreviewWrap.appendChild(img);
    }

    // 파일 정보 렌더링
    renderResultInfo(width, height, blob.size, frameCount);

    // 부드럽게 스크롤
    els.resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderResultInfo(w, h, size, frames) {
    const origSize = state.fileSize;
    const diff = size - origSize;
    const diffPct = ((diff / origSize) * 100).toFixed(1);
    const diffSign = diff > 0 ? `+${diffPct}%` : `${diffPct}%`;
    const color = diff <= 0 ? "#2f7d4a" : "#b83b1d";

    els.resultInfoGrid.innerHTML = `
      <div class="info-label">파일명</div>
      <div class="info-value"><b>${escapeHtml(state.resultName)}</b></div>
      <div class="info-label">해상도</div>
      <div class="info-value">${w} × ${h} px</div>
      <div class="info-label">파일 크기</div>
      <div class="info-value"><b>${formatBytes(size)}</b> <span style="font-size:12px; color:${color}">(${diffSign})</span></div>
      <div class="info-label">프레임 정보</div>
      <div class="info-value">${frames} 프레임 (${state.resultExt.toUpperCase()})</div>
    `;
  }

  // 9. 마지막 저장 기능 (showSaveFilePicker 기반 스마트 저장)
  function bindSavePicker() {
    els.saveResultBtn.addEventListener("click", async () => {
      if (!state.resultBlob) return;

      const suggestedName = state.resultName || `${state.baseName}_ed.${state.resultExt}`;
      const ext = state.resultExt;

      // 브라우저의 파일 시스템 액세스 API (폴더 및 파일명 선택 대화상자) 지원 여부 확인
      if (window.showSaveFilePicker) {
        try {
          const typeDescription = ext.toUpperCase() + " 파일";
          const acceptMap = {};
          acceptMap[state.resultMime] = [`.${ext}`];

          const handle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [{
              description: typeDescription,
              accept: acceptMap
            }]
          });

          const writable = await handle.createWritable();
          await writable.write(state.resultBlob);
          await writable.close();
          return;
        } catch (err) {
          if (err.name === "AbortError") {
            // 사용자가 저장 취소
            return;
          }
          console.warn("showSaveFilePicker 실패, 기본 다운로드 폴백 진행:", err);
        }
      }

      // showSaveFilePicker를 지원하지 않는 브라우저이거나 오류 시 일반 다운로드 트리거
      const a = document.createElement("a");
      a.href = state.resultBlobUrl;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  }

})();
