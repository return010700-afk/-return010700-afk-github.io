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
    activeTool: null,
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
      aspect: "1:1",
      fillMode: "contain",
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
      format: "mp4"
    },

    // 5. Rotate 상태
    rotate: {
      deg: 0,
      flipH: false,
      flipV: false
    },

    // 6. Optimize 상태
    optimize: {
      mode: "smart"
    },

    // 7. Reverse 상태
    reverse: {
      mode: "true"
    },

    // 8. Speed 상태
    speed: {
      rate: 1.0
    },

    // 9. Cut 상태
    cut: {
      start: 1,
      end: 1
    },

    // 10. Sticker 상태
    stickers: [], // { id, icon, x, y, size }
    selectedStickerId: null,
    stickerSize: 48,

    // 11. Text 상태
    texts: [], // { id, text, x, y, size, color, font }
    selectedTextId: null,
    textDraft: {
      text: "Hello GIF!",
      size: 32,
      color: "#ffffff",
      font: "Malgun Gothic, sans-serif"
    },

    // 12. Draw 상태
    draw: {
      mode: "brush", // 'brush' | 'eraser'
      color: "#ff2a2a",
      width: 5,
      isDrawing: false,
      strokes: [], // [ { mode, color, width, points: [{x, y}] } ]
      currentStroke: null
    },

    // 오버레이 드래그 제어
    dragTarget: null // { type: 'sticker'|'text', id, offsetX, offsetY }
  };

  // 12개 도구 목록 메타데이터
  const TOOLS = [
    { id: "resize", name: "Resize", icon: "📐", title: "Resize (크기 조절)" },
    { id: "crop", name: "Crop", icon: "✂️", title: "Crop (비율 자르기 & 여백 채우기)" },
    { id: "downsizing", name: "Downsizing", icon: "📉", title: "Downsizing (용량 다이어트)" },
    { id: "convert", name: "Format Convert", icon: "🔄", title: "Format Convert (MP4 / JPG 변환)" },
    { id: "rotate", name: "Rotate", icon: "🔁", title: "Rotate & Flip (회전 및 반전)" },
    { id: "optimize", name: "Optimize", icon: "⚡", title: "Optimize (화질 유지 최적화)" },
    { id: "reverse", name: "Reverse", icon: "◀️", title: "Reverse (역재생 & 왕복)" },
    { id: "speed", name: "Speed", icon: "⏱️", title: "Speed (재생 속도 조절)" },
    { id: "cut", name: "Cut", icon: "🎞️", title: "Cut (구간 자르기)" },
    { id: "sticker", name: "Sticker", icon: "💖", title: "Sticker (스티커 넣기)" },
    { id: "text", name: "Text", icon: "✍️", title: "Text (글씨 쓰기)" },
    { id: "draw", name: "Draw", icon: "🎨", title: "Draw (그림 그리기)" }
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

    // 왼쪽 원본 및 실시간 라이브 미리보기 카드
    originalCard: document.getElementById("originalCard"),
    origCardTitle: document.getElementById("origCardTitle"),
    liveStatusBadge: document.getElementById("liveStatusBadge"),
    origFoldBtn: document.getElementById("origFoldBtn"),
    origCardBody: document.getElementById("origCardBody"),
    origPreviewWrap: document.getElementById("origPreviewWrap"),
    origImg: document.getElementById("origImg"),
    livePreviewCanvas: document.getElementById("livePreviewCanvas"),
    liveOverlayCanvas: document.getElementById("liveOverlayCanvas"),
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
    liveHintText: document.getElementById("liveHintText"),

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
    panelSticker: document.getElementById("panelSticker"),
    panelText: document.getElementById("panelText"),
    panelDraw: document.getElementById("panelDraw"),

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
    valCutTotal: document.getElementById("valCutTotal"),

    // 10. Sticker 엘리먼트
    stickerPalette: document.getElementById("stickerPalette"),
    rangeStickerSize: document.getElementById("rangeStickerSize"),
    valStickerSize: document.getElementById("valStickerSize"),
    btnDeleteSelectedSticker: document.getElementById("btnDeleteSelectedSticker"),
    btnClearAllStickers: document.getElementById("btnClearAllStickers"),

    // 11. Text 엘리먼트
    inputTextString: document.getElementById("inputTextString"),
    inputTextColor: document.getElementById("inputTextColor"),
    rangeTextSize: document.getElementById("rangeTextSize"),
    valTextSize: document.getElementById("valTextSize"),
    fontFamilyGroup: document.getElementById("fontFamilyGroup"),
    btnApplyTextItem: document.getElementById("btnApplyTextItem"),
    btnDeleteSelectedText: document.getElementById("btnDeleteSelectedText"),

    // 12. Draw 엘리먼트
    drawModeGroup: document.getElementById("drawModeGroup"),
    drawColorRow: document.getElementById("drawColorRow"),
    drawPenColor: document.getElementById("drawPenColor"),
    rangeDrawWidth: document.getElementById("rangeDrawWidth"),
    valDrawWidth: document.getElementById("valDrawWidth"),
    btnUndoDraw: document.getElementById("btnUndoDraw"),
    btnClearDraw: document.getElementById("btnClearDraw")
  };

  init();

  function init() {
    bindTabs();
    bindUpload();
    bindFold();
    bindToolsNavigation();
    bindAllToolControls();
    bindOverlayEvents();
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

    // 장식 아이템 초기화
    state.stickers = [];
    state.texts = [];
    state.draw.strokes = [];

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
    els.origImg.hidden = false;
    els.origImg.src = state.origBlobUrl;
    els.livePreviewCanvas.hidden = true;
    els.liveOverlayCanvas.hidden = true;
    els.liveStatusBadge.hidden = true;

    renderOriginalInfo();
    els.resultCard.hidden = true;
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

  // 4. 12개 도구 탐색 및 메뉴
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

    // 왼쪽 창을 순수 원본 모드로 복원
    els.origCardTitle.innerHTML = "&lt;Original GIF&gt;";
    els.liveStatusBadge.hidden = true;
    els.origImg.hidden = false;
    els.livePreviewCanvas.hidden = true;
    els.liveOverlayCanvas.hidden = true;
    renderOriginalInfo();
  }

  function openTool(toolId) {
    state.activeTool = toolId;
    const tool = TOOLS.find(t => t.id === toolId);
    els.toolsCardTitle.textContent = tool ? tool.title : "편집 도구";
    els.toolsGrid.hidden = true;
    els.toolDetailContainer.hidden = false;
    els.toolProgress.hidden = true;
    els.toolGoBtn.disabled = false;

    // 왼쪽 창을 실시간 미리보기 모드로 변경
    els.origCardTitle.innerHTML = `&lt;${tool ? tool.name : 'Live'} 미리보기&gt;`;
    els.liveStatusBadge.hidden = false;
    els.origImg.hidden = true;
    els.livePreviewCanvas.hidden = false;

    // 스티커, 텍스트, 그리기 모드일 때만 인터랙티브 오버레이 활성화
    const isInteractive = (toolId === "sticker" || toolId === "text" || toolId === "draw");
    els.liveOverlayCanvas.hidden = !isInteractive;
    if (toolId === "draw") {
      els.liveOverlayCanvas.style.cursor = "crosshair";
    } else if (toolId === "sticker" || toolId === "text") {
      els.liveOverlayCanvas.style.cursor = "move";
    } else {
      els.liveOverlayCanvas.style.cursor = "default";
    }

    // 힌트 텍스트 맞춤 변경
    if (isInteractive) {
      els.liveHintText.innerHTML = "왼쪽 화면에서 마우스로 <strong>스티커/글자를 드래그</strong>하거나 <strong>직접 선을 그려</strong> 꾸밀 수 있습니다!";
    } else {
      els.liveHintText.innerHTML = "오른쪽에서 옵션을 조절하면 <strong>왼쪽 미리보기 창에 즉시 실시간으로 반영</strong>됩니다!";
    }

    // 모든 서브패널 숨김
    const panels = [
      els.panelResize, els.panelCrop, els.panelDownsizing,
      els.panelConvert, els.panelRotate, els.panelOptimize,
      els.panelReverse, els.panelSpeed, els.panelCut,
      els.panelSticker, els.panelText, els.panelDraw
    ];
    panels.forEach(p => p.hidden = true);

    // 해당 패널 초기화 및 노출
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
    } else if (toolId === "sticker") {
      els.panelSticker.hidden = false;
    } else if (toolId === "text") {
      els.panelText.hidden = false;
    } else if (toolId === "draw") {
      els.panelDraw.hidden = false;
    }

    startLivePreview();
  }

  // 5. 각 도구별 컨트롤 이벤트 및 초기화
  function bindAllToolControls() {
    bindResizeControls();
    bindCropControls();
    bindDownsizingControls();
    bindConvertControls();
    bindRotateControls();
    bindOptimizeControls();
    bindReverseControls();
    bindSpeedControls();
    bindCutControls();
    bindStickerControls();
    bindTextControls();
    bindDrawControls();
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
    updateLiveInfoGrid(state.resize.width, state.resize.height, state.origFrames.length);
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
    const count = (state.cut.end - state.cut.start + 1);
    els.valCutTotal.textContent = count;
    updateLiveInfoGrid(state.origWidth, state.origHeight, count);
  }

  // --- 10. Sticker 컨트롤 ---
  function bindStickerControls() {
    els.stickerPalette.addEventListener("click", (e) => {
      const btn = e.target.closest(".sticker-item");
      if (!btn) return;
      const icon = btn.getAttribute("data-icon");
      addSticker(icon);
    });

    els.rangeStickerSize.addEventListener("input", (e) => {
      const sz = parseInt(e.target.value, 10);
      state.stickerSize = sz;
      els.valStickerSize.textContent = `${sz}px`;
      if (state.selectedStickerId) {
        const target = state.stickers.find(s => s.id === state.selectedStickerId);
        if (target) target.size = sz;
      }
    });

    els.btnDeleteSelectedSticker.addEventListener("click", () => {
      if (!state.selectedStickerId) return;
      state.stickers = state.stickers.filter(s => s.id !== state.selectedStickerId);
      state.selectedStickerId = null;
    });

    els.btnClearAllStickers.addEventListener("click", () => {
      state.stickers = [];
      state.selectedStickerId = null;
    });
  }

  function addSticker(icon) {
    const id = "stk_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const newSticker = {
      id: id,
      icon: icon,
      x: state.origWidth / 2,
      y: state.origHeight / 2,
      size: state.stickerSize
    };
    state.stickers.push(newSticker);
    state.selectedStickerId = id;
  }

  // --- 11. Text 컨트롤 ---
  function bindTextControls() {
    els.inputTextString.addEventListener("input", (e) => {
      state.textDraft.text = e.target.value;
      if (state.selectedTextId) {
        const t = state.texts.find(x => x.id === state.selectedTextId);
        if (t) t.text = e.target.value;
      }
    });

    els.inputTextColor.addEventListener("input", (e) => {
      state.textDraft.color = e.target.value;
      if (state.selectedTextId) {
        const t = state.texts.find(x => x.id === state.selectedTextId);
        if (t) t.color = e.target.value;
      }
    });

    els.rangeTextSize.addEventListener("input", (e) => {
      const sz = parseInt(e.target.value, 10);
      state.textDraft.size = sz;
      els.valTextSize.textContent = `${sz}px`;
      if (state.selectedTextId) {
        const t = state.texts.find(x => x.id === state.selectedTextId);
        if (t) t.size = sz;
      }
    });

    els.fontFamilyGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.fontFamilyGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.textDraft.font = btn.getAttribute("data-font");
      if (state.selectedTextId) {
        const t = state.texts.find(x => x.id === state.selectedTextId);
        if (t) t.font = state.textDraft.font;
      }
    });

    els.btnApplyTextItem.addEventListener("click", () => {
      if (!state.textDraft.text.trim()) return;
      addTextItem();
    });

    els.btnDeleteSelectedText.addEventListener("click", () => {
      if (!state.selectedTextId) return;
      state.texts = state.texts.filter(t => t.id !== state.selectedTextId);
      state.selectedTextId = null;
    });
  }

  function addTextItem() {
    const id = "txt_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const newText = {
      id: id,
      text: state.textDraft.text,
      x: state.origWidth / 2,
      y: state.origHeight / 2,
      size: state.textDraft.size,
      color: state.textDraft.color,
      font: state.textDraft.font
    };
    state.texts.push(newText);
    state.selectedTextId = id;
  }

  // --- 12. Draw 컨트롤 ---
  function bindDrawControls() {
    els.drawModeGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-choice");
      if (!btn) return;
      els.drawModeGroup.querySelectorAll(".btn-choice").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.draw.mode = btn.getAttribute("data-mode");
      els.drawColorRow.style.display = state.draw.mode === "brush" ? "flex" : "none";
    });

    els.drawPenColor.addEventListener("input", (e) => {
      state.draw.color = e.target.value;
    });

    els.rangeDrawWidth.addEventListener("input", (e) => {
      const w = parseInt(e.target.value, 10);
      state.draw.width = w;
      els.valDrawWidth.textContent = `${w}px`;
    });

    els.btnUndoDraw.addEventListener("click", () => {
      state.draw.strokes.pop();
    });

    els.btnClearDraw.addEventListener("click", () => {
      state.draw.strokes = [];
    });
  }

  // --- 인터랙티브 오버레이 마우스 이벤트 (Sticker, Text 드래그 & 그림 그리기) ---
  function bindOverlayEvents() {
    const oCanvas = els.liveOverlayCanvas;

    oCanvas.addEventListener("mousedown", (e) => {
      const pos = getOverlayMousePos(e);

      // 1. Draw 모드일 때
      if (state.activeTool === "draw") {
        state.draw.isDrawing = true;
        state.draw.currentStroke = {
          mode: state.draw.mode,
          color: state.draw.color,
          width: state.draw.width,
          points: [{ x: pos.x, y: pos.y }]
        };
        state.draw.strokes.push(state.draw.currentStroke);
        return;
      }

      // 2. Text 모드일 때 텍스트 클릭 여부 판별
      if (state.activeTool === "text") {
        for (let i = state.texts.length - 1; i >= 0; i--) {
          const t = state.texts[i];
          const dist = Math.hypot(pos.x - t.x, pos.y - t.y);
          if (dist < t.size * 1.5) {
            state.selectedTextId = t.id;
            state.dragTarget = {
              type: "text",
              id: t.id,
              offsetX: pos.x - t.x,
              offsetY: pos.y - t.y
            };
            return;
          }
        }
      }

      // 3. Sticker 모드일 때 스티커 클릭 여부 판별
      if (state.activeTool === "sticker") {
        for (let i = state.stickers.length - 1; i >= 0; i--) {
          const s = state.stickers[i];
          const dist = Math.hypot(pos.x - s.x, pos.y - s.y);
          if (dist < s.size * 0.8) {
            state.selectedStickerId = s.id;
            state.dragTarget = {
              type: "sticker",
              id: s.id,
              offsetX: pos.x - s.x,
              offsetY: pos.y - s.y
            };
            return;
          }
        }
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (state.draw.isDrawing && state.draw.currentStroke) {
        const pos = getOverlayMousePos(e);
        state.draw.currentStroke.points.push({ x: pos.x, y: pos.y });
        return;
      }

      if (state.dragTarget) {
        const pos = getOverlayMousePos(e);
        if (state.dragTarget.type === "sticker") {
          const s = state.stickers.find(x => x.id === state.dragTarget.id);
          if (s) {
            s.x = pos.x - state.dragTarget.offsetX;
            s.y = pos.y - state.dragTarget.offsetY;
          }
        } else if (state.dragTarget.type === "text") {
          const t = state.texts.find(x => x.id === state.dragTarget.id);
          if (t) {
            t.x = pos.x - state.dragTarget.offsetX;
            t.y = pos.y - state.dragTarget.offsetY;
          }
        }
      }
    });

    window.addEventListener("mouseup", () => {
      state.draw.isDrawing = false;
      state.draw.currentStroke = null;
      state.dragTarget = null;
    });
  }

  function getOverlayMousePos(e) {
    const oCanvas = els.liveOverlayCanvas;
    const rect = oCanvas.getBoundingClientRect();
    const scaleX = oCanvas.width / rect.width;
    const scaleY = oCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function updateLiveInfoGrid(w, h, frames) {
    els.origInfoGrid.innerHTML = `
      <div class="info-label">파일명</div>
      <div class="info-value">${escapeHtml(state.fileName)}</div>
      <div class="info-label">실시간 해상도</div>
      <div class="info-value"><b>${w} × ${h} px</b> (${Math.round((w / state.origWidth) * 100)}%)</div>
      <div class="info-label">프레임 수</div>
      <div class="info-value">${frames} 프레임</div>
    `;
  }

  // 6. 실시간 미리보기 (Live Preview Loop)
  function startLivePreview() {
    stopLivePreview();
    state.previewFrameIdx = 0;
    state.previewLastTime = performance.now();

    function loop(now) {
      if (!state.activeTool || !state.origFrames.length) return;

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

  function getProcessedSequencePreview() {
    let list = state.origFrames;

    if (state.activeTool === "cut") {
      const s = state.cut.start - 1;
      const e = state.cut.end;
      list = list.slice(s, e);
    }

    if (state.activeTool === "downsizing" && state.downsizing.dropFrames) {
      list = list.filter((_, idx) => idx % 2 === 0);
    }

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

  // 실시간 렌더링 (애니메이션 캔버스 + 장식 요소 오버레이 동기화)
  function renderLiveFrame(sourceCanvas) {
    const pCanvas = els.livePreviewCanvas;
    const pCtx = pCanvas.getContext("2d");
    const oCanvas = els.liveOverlayCanvas;
    const oCtx = oCanvas.getContext("2d");

    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;

    let dw = sw;
    let dh = sh;

    if (state.activeTool === "resize") {
      dw = state.resize.width;
      dh = state.resize.height;
    } else if (state.activeTool === "crop") {
      const [aw, ah] = state.crop.aspect.split(":").map(Number);
      const targetRatio = aw / ah;
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

    // 캔버스 버퍼 크기 일치
    if (pCanvas.width !== dw || pCanvas.height !== dh) {
      pCanvas.width = dw;
      pCanvas.height = dh;
    }

    pCanvas.style.width = dw + "px";
    pCanvas.style.height = dh + "px";
    pCanvas.style.maxWidth = "100%";
    pCanvas.style.maxHeight = "440px";
    pCanvas.style.objectFit = "contain";

    // 인터랙티브 오버레이 캔버스도 동일한 크기로 동기화
    if (!oCanvas.hidden) {
      if (oCanvas.width !== dw || oCanvas.height !== dh) {
        oCanvas.width = dw;
        oCanvas.height = dh;
      }
      oCanvas.style.width = pCanvas.clientWidth + "px";
      oCanvas.style.height = pCanvas.clientHeight + "px";
      oCtx.clearRect(0, 0, dw, dh);
    }

    pCtx.clearRect(0, 0, dw, dh);

    // 1. Crop 렌더링
    if (state.activeTool === "crop") {
      if (state.crop.fillMode === "contain") {
        pCtx.fillStyle = state.crop.bgColor;
        pCtx.fillRect(0, 0, dw, dh);
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
    } else if (state.activeTool === "rotate") {
      // 2. Rotate & Flip 렌더링
      pCtx.save();
      pCtx.translate(dw / 2, dh / 2);
      pCtx.rotate((state.rotate.deg * Math.PI) / 180);
      pCtx.scale(state.rotate.flipH ? -1 : 1, state.rotate.flipV ? -1 : 1);
      pCtx.drawImage(sourceCanvas, -sw / 2, -sh / 2, sw, sh);
      pCtx.restore();
    } else {
      // 기본 렌더링
      pCtx.imageSmoothingEnabled = true;
      pCtx.imageSmoothingQuality = "high";
      pCtx.drawImage(sourceCanvas, 0, 0, dw, dh);
    }

    // [중요] 스티커, 텍스트, 손그림을 현재 애니메이션 캔버스 위에 바로 렌더링
    renderDecorations(pCtx, dw, dh, false);

    // 인터랙티브 오버레이 캔버스에는 선택 핸들/가이드 박스 표시
    if (!oCanvas.hidden) {
      renderDecorations(oCtx, dw, dh, true);
    }
  }

  // 장식 요소(손그림, 스티커, 텍스트) 렌더링 공통 함수
  function renderDecorations(ctx, w, h, showSelectionOutline) {
    // 1. 손그림 그리기 (Strokes)
    if (state.draw.strokes.length > 0) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      state.draw.strokes.forEach(stroke => {
        if (!stroke.points || stroke.points.length < 2) return;
        ctx.beginPath();
        if (stroke.mode === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = stroke.color;
        }
        ctx.lineWidth = stroke.width;
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // 2. 스티커 렌더링
    state.stickers.forEach(s => {
      ctx.save();
      ctx.font = `${s.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.icon, s.x, s.y);

      // 선택된 스티커 강조 외곽선
      if (showSelectionOutline && s.id === state.selectedStickerId && state.activeTool === "sticker") {
        ctx.strokeStyle = "#2f7d4a";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(s.x - s.size * 0.6, s.y - s.size * 0.6, s.size * 1.2, s.size * 1.2);
      }
      ctx.restore();
    });

    // 3. 텍스트 렌더링
    state.texts.forEach(t => {
      ctx.save();
      ctx.font = `bold ${t.size}px ${t.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 가독성을 위한 검은색 외곽선 효과
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.lineWidth = Math.max(3, t.size / 8);
      ctx.strokeText(t.text, t.x, t.y);

      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);

      // 선택된 텍스트 강조 외곽선
      if (showSelectionOutline && t.id === state.selectedTextId && state.activeTool === "text") {
        const metrics = ctx.measureText(t.text);
        const tw = metrics.width;
        const th = t.size;
        ctx.strokeStyle = "#2f7d4a";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(t.x - tw / 2 - 8, t.y - th / 2 - 4, tw + 16, th + 8);
      }
      ctx.restore();
    });
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

  function executeGifGeneration(tool) {
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

    let quality = 10;
    if (tool === "downsizing" && state.downsizing.reduceQuality) {
      quality = 24;
    } else if (tool === "optimize") {
      quality = state.optimize.mode === "smart" ? 12 : 8;
    }

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

      // [핵심] 모든 움직이는 프레임에 동일하게 스티커/텍스트/그림 합치기
      renderDecorations(tCtx, outW, outH, false);

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

  function executeConvertJpg() {
    updateProgress(50, "JPG 이미지 추출 중...");
    setTimeout(() => {
      const frame = state.origFrames[0].canvas;
      const jCanvas = document.createElement("canvas");
      jCanvas.width = frame.width;
      jCanvas.height = frame.height;
      const jCtx = jCanvas.getContext("2d");
      jCtx.drawImage(frame, 0, 0);
      renderDecorations(jCtx, frame.width, frame.height, false);

      jCanvas.toBlob((blob) => {
        completeProcess(blob, "image/jpeg", "jpg", frame.width, frame.height, 1, "convert_jpg");
      }, "image/jpeg", 0.95);
    }, 150);
  }

  function executeConvertMp4() {
    updateProgress(20, "비디오 변환 녹화 준비 중...");

    const sw = state.origWidth;
    const sh = state.origHeight;
    const vCanvas = document.createElement("canvas");
    vCanvas.width = sw;
    vCanvas.height = sh;
    const vCtx = vCanvas.getContext("2d");

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
      renderDecorations(vCtx, sw, sh, false);

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

    // 1. 왼쪽에 있던 창은 접어줌
    els.origCardBody.classList.add("collapsed");
    els.origFoldBtn.textContent = "▶";

    // 2. 결과 저장
    state.resultBlob = blob;
    state.resultMime = mime;
    state.resultExt = ext;
    state.resultName = `${state.baseName}_ed.${ext}`;

    if (state.resultBlobUrl) URL.revokeObjectURL(state.resultBlobUrl);
    state.resultBlobUrl = URL.createObjectURL(blob);

    // 3. 결과 창 업데이트
    const toolTitle = TOOLS.find(t => t.id === state.activeTool)?.name || "Result";
    els.resultCardTitle.textContent = `<${toolTitle} Result>`;
    els.resultCard.hidden = false;
    els.resultCardBody.classList.remove("collapsed");
    els.resultFoldBtn.textContent = "▼";

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

    renderResultInfo(width, height, blob.size, frameCount);
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

  // 9. 파일 저장 (showSaveFilePicker)
  function bindSavePicker() {
    els.saveResultBtn.addEventListener("click", async () => {
      if (!state.resultBlob) return;

      const suggestedName = state.resultName || `${state.baseName}_ed.${state.resultExt}`;
      const ext = state.resultExt;

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
          if (err.name === "AbortError") return;
          console.warn("showSaveFilePicker 실패, 기본 다운로드 폴백 진행:", err);
        }
      }

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
