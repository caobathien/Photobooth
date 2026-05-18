// ================= STATE VARIABLES =================
let selectedLayout = null; // '2-strip', '4-strip', '2x2-grid' or themed layouts
let selectedTheme = null; // themed layout config object
let maxImages = 0;
let capturedImages = []; // Stores all 6 captured data URLs
let selectedImages = []; // Stores selected images to be put in template
let selectedSelectionIndices = []; // Indices of selected photos (from 0 to 5)
let cameraStream = null;
let currentFacingMode = 'user';
let isCapturing = false;
let currentZoom = 1;
let isPremiumUnlocked = localStorage.getItem('premiumUnlocked') === 'true';

// Camera Filters & Beauty Settings
const CAMERA_FILTERS = {
  original: {
    name: "Original",
    css: "none",
    overlay: "transparent",
    beauty: { smoothing: 0, brightenFace: 0, soften: 0 }
  },
  beautyNatural: {
    name: "Beauty Natural",
    css: "brightness(1.10) contrast(1.03) saturate(1.08)",
    overlay: "rgba(255, 230, 240, 0.06)",
    beauty: { smoothing: 0.15, brightenFace: 0.12, soften: 0.08 }
  },
  smoothSkin: {
    name: "Smooth Skin",
    css: "brightness(1.08) contrast(0.98) saturate(1.06)",
    overlay: "rgba(255,255,255,0.05)",
    beauty: { smoothing: 0.22, brightenFace: 0.08, soften: 0.15 }
  },
  brightFace: {
    name: "Bright Face",
    css: "brightness(1.16) contrast(1.02) saturate(1.06)",
    overlay: "rgba(255, 248, 240, 0.06)",
    beauty: { smoothing: 0.10, brightenFace: 0.20, soften: 0.06 }
  },
  koreanBeauty: {
    name: "Korean Beauty",
    css: "brightness(1.18) contrast(0.96) saturate(1.08)",
    overlay: "rgba(255, 220, 235, 0.08)",
    beauty: { smoothing: 0.18, brightenFace: 0.16, soften: 0.10 }
  },
  cutePink: {
    name: "Cute Pink",
    css: "brightness(1.14) contrast(1.00) saturate(1.15) hue-rotate(-6deg)",
    overlay: "rgba(255, 170, 210, 0.08)",
    beauty: { smoothing: 0.16, brightenFace: 0.12, soften: 0.08 }
  },
  tiktokGlow: {
    name: "TikTok Glow",
    css: "brightness(1.12) contrast(1.10) saturate(1.18)",
    overlay: "rgba(190, 140, 255, 0.06)",
    beauty: { smoothing: 0.14, brightenFace: 0.14, soften: 0.10 }
  },
  dreamySoft: {
    name: "Dreamy Soft",
    css: "brightness(1.16) contrast(0.92) saturate(1.10)",
    overlay: "rgba(255,255,255,0.10)",
    beauty: { smoothing: 0.20, brightenFace: 0.10, soften: 0.16 }
  }
};
let activeCameraFilter = 'original';

// Face Detection State
let faceDetector = null;
let isFaceAligned = false;
let autoCaptureEnabled = false;
let alignTime = 0;
let faceDetectionRAF = null;

// Editor State
let frameBg = '#ffffff';
let currentFilter = 'none';
let currentOverlay = 'none';
let showDateStamp = false;
let adjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };

// Draggable Elements (Stickers & Text)
let draggableElements = [];
let selectedElementIndex = -1;
let dragStartX = 0, dragStartY = 0;
let isDragging = false;

const stickersList = ['❤️','✨','🌸','🐰','🐱','⭐','💖','🎀','😍','🔥','🦋','🌈'];

// DOM Elements
const screens = {
    layout: document.getElementById('layoutScreen'),
    camera: document.getElementById('cameraScreen'),
    selection: document.getElementById('selectionScreen'),
    editor: document.getElementById('editorScreen')
};

// Support State
let hasSeenSupportPopup = false;

const cameraVideo = document.getElementById('cameraVideo');
const countdownEl = document.getElementById('countdown');
const flashEl = document.getElementById('flash');
const captureCanvas = document.getElementById('captureCanvas');
const finalCanvas = document.getElementById('finalCanvas');
const interactiveLayer = document.getElementById('interactiveLayer');
const thumbnailsContainer = document.getElementById('shotThumbnails');
const btnEnterRoom = document.getElementById('btnEnterRoom');
const btnCapture = document.getElementById('btnCapture');
const shotCounter = document.querySelector('.shot-counter');
const toastEl = document.getElementById('toast');

const beepAudio = document.getElementById('beepAudio');
const shutterAudio = document.getElementById('shutterAudio');

// ================= INIT =================
function init() {
    renderStickers();
    setupInteractiveLayer();
    renderLiveFilters();
    initFaceDetection();
    
    // Prevent zoom on mobile double tap
    document.addEventListener('dblclick', function(event) {
        event.preventDefault();
    }, { passive: false });

    initPinchToZoom();
}

// ================= PINCH TO ZOOM GESTURE =================
function initPinchToZoom() {
    const selfieFrame = document.querySelector('.selfie-frame');
    if (!selfieFrame) return;

    let initialPinchDistance = null;
    let initialZoom = 1;

    function getPinchDistance(e) {
        if (e.touches.length < 2) return null;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    selfieFrame.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialPinchDistance = getPinchDistance(e);
            initialZoom = currentZoom;
        }
    });

    selfieFrame.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
            e.preventDefault(); // Ngăn trình duyệt cuộn trang
            const currentDistance = getPinchDistance(e);
            const scale = currentDistance / initialPinchDistance;
            let newZoom = initialZoom * scale;
            
            if (newZoom < 0.5) newZoom = 0.5;
            if (newZoom > 3) newZoom = 3;
            
            // Limit decimal places to make slider sync smooth
            newZoom = Math.round(newZoom * 10) / 10;
            updateZoom(newZoom);
        }
    }, { passive: false });

    selfieFrame.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialPinchDistance = null;
        }
    });
}

// ================= LAYOUT SCREEN =================
// Themed layout configurations
const THEMED_LAYOUTS = {
    'luxury-neon': { name: 'Luxury Neon', type: 'premium', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #1a0030, #2d0050)', borderColor: '#b56cff', decos: ['✨','💜','⭐'], textDefault: 'Luxury Neon' },
    'pink-dream': { name: 'Pink Dream', type: 'premium', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #ffe0f0, #ffc0e0)', borderColor: '#ff69b4', decos: ['🌸','💕','🎀'], textDefault: 'Pink Dream' },
    'kawaii-booth': { name: 'Kawaii Booth', type: 'premium', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #fff0f5, #ffe4f0)', borderColor: '#ffb6c1', decos: ['🐰','🌟','🍭','🎀'], textDefault: 'Kawaii ♡' },
    'elegant-black': { name: 'Elegant Black', type: 'premium', photoCount: 2, baseLayout: '2-strip', bg: '#0a0a0a', borderColor: '#d4af37', decos: ['⭐'], textDefault: 'Elegant' },
    'soft-pastel': { name: 'Soft Pastel', type: 'premium', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #e8daef, #d5f5e3, #fdebd0)', borderColor: '#c39bd3', decos: ['🌈','🦋','☁️'], textDefault: 'Soft Pastel' },
    'couple-memories': { name: 'Couple Memories', type: 'premium', photoCount: 2, baseLayout: '2-strip', bg: 'linear-gradient(135deg, #fce4ec, #f8bbd0)', borderColor: '#e91e63', decos: ['❤️','💑','💕'], textDefault: 'Our Memories' },
    'tet': { name: 'Tết Việt Nam', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #c62828, #ff8f00)', borderColor: '#ffd700', decos: ['🌺','🧧','🎊','🏮'], textDefault: 'Chúc Mừng Năm Mới' },
    'valentine': { name: 'Valentine', type: 'seasonal', photoCount: 2, baseLayout: '2-strip', bg: 'linear-gradient(135deg, #e91e63, #f48fb1)', borderColor: '#ff1744', decos: ['❤️','💕','💘','🌹'], textDefault: 'Happy Valentine' },
    'christmas': { name: 'Giáng Sinh', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #1b5e20, #b71c1c)', borderColor: '#fff', decos: ['🎄','⭐','❄️','🎁'], textDefault: 'Merry Christmas' },
    'halloween': { name: 'Halloween', type: 'seasonal', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #1a0a2e, #ff6f00)', borderColor: '#ff9800', decos: ['🎃','👻','🦇','🕷️'], textDefault: 'Happy Halloween' },
    'birthday': { name: 'Sinh nhật', type: 'seasonal', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #e1bee7, #bbdefb, #fff9c4)', borderColor: '#ff4081', decos: ['🎈','🎂','🎉','🎊'], textDefault: 'Happy Birthday!' },
    'graduation': { name: 'Graduation', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #1a1a2e, #d4af37)', borderColor: '#d4af37', decos: ['🎓','⭐','🏆'], textDefault: 'Congratulations!' }
};

function switchLayoutCategory(category, btnEl) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btnEl.classList.add('active');
    
    document.getElementById('layoutCatFree').classList.add('hidden');
    document.getElementById('layoutCatPremium').classList.add('hidden');
    document.getElementById('layoutCatSeasonal').classList.add('hidden');
    document.getElementById(`layoutCat${category.charAt(0).toUpperCase() + category.slice(1)}`).classList.remove('hidden');
}

function selectLayout(type) {
    selectedLayout = type;
    selectedTheme = null;
    
    document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
    const cardEl = document.querySelector(`.card[data-layout="${type}"]`);
    if (cardEl) cardEl.classList.add('selected');
    
    btnEnterRoom.disabled = false;
    
    if (type === '2-strip') maxImages = 2;
    else if (type === '4-strip') maxImages = 4;
    else if (type === '2x2-grid') maxImages = 4;
}

function selectPremiumLayout(themeId) {
    if (!isPremiumUnlocked) {
        pendingThemeId = themeId;
        document.getElementById('supportModal').classList.remove('hidden');
        return;
    }
    
    const theme = THEMED_LAYOUTS[themeId];
    if (!theme) return;
    
    selectedTheme = { ...theme, id: themeId };
    selectedLayout = theme.baseLayout;
    maxImages = theme.photoCount;
    
    document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
    const cardEl = document.querySelector(`.card[data-layout="${themeId}"]`);
    if (cardEl) cardEl.classList.add('selected');
    
    btnEnterRoom.disabled = false;
}

let pendingThemeId = null;

function unlockPremium() {
    isPremiumUnlocked = true;
    localStorage.setItem('premiumUnlocked', 'true');
    document.getElementById('supportModal').classList.add('hidden');
    showToast('Cảm ơn bạn đã ủng hộ! Premium đã được mở khóa 💖');
    
    if (pendingThemeId) {
        selectPremiumLayout(pendingThemeId);
        pendingThemeId = null;
    }
}

function closeSupportModal() {
    document.getElementById('supportModal').classList.add('hidden');
}

function proceedWithLayout() {
    document.getElementById('supportModal').classList.add('hidden');
    hasSeenSupportPopup = true;
    selectLayout('4-strip');
}

function goToCamera() {
    if (!selectedLayout) return;
    switchScreen('camera');
    updateShotCounter();
}

function goBackToLayout() {
    stopCamera();
    resetShoot();
    selectedLayout = null;
    selectedTheme = null;
    document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
    btnEnterRoom.disabled = true;
    
    document.getElementById('btnStartCamera').classList.remove('hidden');
    document.getElementById('btnCapture').classList.add('hidden');
    
    switchScreen('layout');
}

// ================= CAMERA SCREEN =================
function renderLiveFilters() {
    const container = document.getElementById('liveFilters');
    if (!container) return;
    container.innerHTML = '';
    
    Object.entries(CAMERA_FILTERS).forEach(([id, filter]) => {
        const btn = document.createElement('div');
        btn.className = `filter-pill ${id === activeCameraFilter ? 'active' : ''}`;
        btn.textContent = filter.name;
        btn.onclick = () => selectCameraFilter(id);
        container.appendChild(btn);
    });
}

function selectCameraFilter(id) {
    activeCameraFilter = id;
    renderLiveFilters();
    cameraVideo.style.filter = CAMERA_FILTERS[id].css;
    
    // Create/update beauty overlay
    let beautyOverlay = document.getElementById('beautyOverlay');
    if (!beautyOverlay) {
        beautyOverlay = document.createElement('div');
        beautyOverlay.id = 'beautyOverlay';
        beautyOverlay.className = 'beauty-overlay';
        cameraVideo.parentNode.insertBefore(beautyOverlay, cameraVideo.nextSibling);
    }
    beautyOverlay.style.background = CAMERA_FILTERS[id].overlay || 'transparent';
}

function toggleAutoCapture() {
    autoCaptureEnabled = document.getElementById('autoCaptureToggle').checked;
}

function switchCameraTab(tabName, btnElement) {
    document.querySelectorAll('.filter-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    
    document.getElementById('cameraTabFilters').classList.add('hidden');
    document.getElementById('cameraTabReshape').classList.add('hidden');
    document.getElementById('cameraTabBackground').classList.add('hidden');
    
    if (tabName === 'filters') {
        document.getElementById('cameraTabFilters').classList.remove('hidden');
    } else if (tabName === 'reshape') {
        document.getElementById('cameraTabReshape').classList.remove('hidden');
    } else if (tabName === 'background') {
        document.getElementById('cameraTabBackground').classList.remove('hidden');
    }
}

// ================= VIRTUAL BACKGROUND =================
let currentVirtualBackground = 'none';
let selfieSegmenter = null;
let isSegmenting = false;
let segmentRAF = null;

function setVirtualBackground(bgType) {
    currentVirtualBackground = bgType;
    document.querySelectorAll('#cameraTabBackground .filter-preview-box').forEach(box => box.classList.remove('active'));
    
    // Find the clicked element based on onclick attribute or pass it as param. Here we just find by matching bgType.
    const boxes = document.querySelectorAll('#cameraTabBackground .filter-preview-box');
    boxes.forEach(box => {
        if (box.getAttribute('onclick').includes(`'${bgType}'`)) box.classList.add('active');
    });

    if (bgType !== 'none') {
        document.getElementById('cameraVideo').style.opacity = '0';
        document.getElementById('bgCanvas').classList.remove('hidden');
        if (!selfieSegmenter) {
            initSelfieSegmentation();
        } else if (!isSegmenting) {
            isSegmenting = true;
            segmentLoop();
        }
    } else {
        document.getElementById('cameraVideo').style.opacity = '1';
        document.getElementById('bgCanvas').classList.add('hidden');
        isSegmenting = false;
        if (segmentRAF) {
            cancelAnimationFrame(segmentRAF);
            segmentRAF = null;
        }
    }
}

async function initSelfieSegmentation() {
    try {
        selfieSegmenter = new SelfieSegmentation({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }});
        selfieSegmenter.setOptions({
            modelSelection: 1, // 0 for general, 1 for landscape (faster)
        });
        selfieSegmenter.onResults(onSegmentationResults);
        
        isSegmenting = true;
        segmentLoop();
    } catch (err) {
        console.error("Selfie segmentation init error:", err);
    }
}

async function segmentLoop() {
    if (!isSegmenting || !cameraVideo || cameraVideo.paused) return;
    
    try {
        await selfieSegmenter.send({image: cameraVideo});
    } catch (e) {}
    
    segmentRAF = requestAnimationFrame(segmentLoop);
}

function onSegmentationResults(results) {
    if (!isSegmenting || currentVirtualBackground === 'none') return;
    
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d');
    
    // Match video dimensions
    if (canvas.width !== cameraVideo.videoWidth) {
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
    }
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    if (currentVirtualBackground === 'blur') {
        ctx.filter = 'blur(10px)';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
    } else {
        let bgStyle = '#000';
        if (currentVirtualBackground === 'color1') bgStyle = 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)';
        else if (currentVirtualBackground === 'color2') bgStyle = 'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)';
        else if (currentVirtualBackground === 'color3') bgStyle = 'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)';
        else if (currentVirtualBackground === 'color4') bgStyle = 'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)';
        
        if (bgStyle.startsWith('linear-gradient')) {
            const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            if (currentVirtualBackground === 'color1') { grad.addColorStop(0, '#ff9a9e'); grad.addColorStop(1, '#fecfef'); }
            else if (currentVirtualBackground === 'color2') { grad.addColorStop(0, '#a1c4fd'); grad.addColorStop(1, '#c2e9fb'); }
            else if (currentVirtualBackground === 'color3') { grad.addColorStop(0, '#cfd9df'); grad.addColorStop(1, '#e2ebf0'); }
            else if (currentVirtualBackground === 'color4') { grad.addColorStop(0, '#4facfe'); grad.addColorStop(1, '#00f2fe'); }
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = bgStyle;
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Mask and draw the person
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'destination-over';
    // The background is already drawn, wait, destination-over means drawing behind existing content.
    // So we should have drawn the person first!
    
    // Let's rewrite the drawing logic properly:
    // 1. Draw mask
    // 2. Draw person (source-in)
    // 3. Draw background (destination-over)
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw Mask
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    
    // 2. Draw person over mask
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    // 3. Draw background behind person
    ctx.globalCompositeOperation = 'destination-over';
    
    if (currentVirtualBackground === 'blur') {
        ctx.filter = 'blur(15px)';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
    } else {
        let bgStyle = '#000';
        if (currentVirtualBackground === 'color1') bgStyle = 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)';
        else if (currentVirtualBackground === 'color2') bgStyle = 'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)';
        else if (currentVirtualBackground === 'color3') bgStyle = 'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)';
        else if (currentVirtualBackground === 'color4') bgStyle = 'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)';
        
        if (bgStyle.startsWith('linear-gradient')) {
            const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            if (currentVirtualBackground === 'color1') { grad.addColorStop(0, '#ff9a9e'); grad.addColorStop(1, '#fecfef'); }
            else if (currentVirtualBackground === 'color2') { grad.addColorStop(0, '#a1c4fd'); grad.addColorStop(1, '#c2e9fb'); }
            else if (currentVirtualBackground === 'color3') { grad.addColorStop(0, '#cfd9df'); grad.addColorStop(1, '#e2ebf0'); }
            else if (currentVirtualBackground === 'color4') { grad.addColorStop(0, '#4facfe'); grad.addColorStop(1, '#00f2fe'); }
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = bgStyle;
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.restore();
}

let captureTimer = 3;
function setTimer(seconds) {
    captureTimer = seconds;
    document.querySelectorAll('.timer-pill').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btnTimer${seconds}`).classList.add('active');
}

function handleUploadPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            captureCanvas.width = 900;
            captureCanvas.height = 1200;
            const ctx = captureCanvas.getContext('2d');
            
            const imgRatio = img.width / img.height;
            const canvasRatio = captureCanvas.width / captureCanvas.height;
            let drawW, drawH, drawX, drawY;
            if (imgRatio > canvasRatio) {
                drawH = captureCanvas.height;
                drawW = captureCanvas.height * imgRatio;
                drawX = (captureCanvas.width - drawW) / 2;
                drawY = 0;
            } else {
                drawW = captureCanvas.width;
                drawH = captureCanvas.width / imgRatio;
                drawX = 0;
                drawY = (captureCanvas.height - drawH) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            
            const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
            capturedImages.push(dataUrl);
            updateShotCounter();
            
            if (capturedImages.length >= 6) {
                setTimeout(() => {
                    stopCamera();
                    goToSelection();
                }, 500);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

// ================= FACE DETECTION =================
async function initFaceDetection() {
    try {
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0");
        const FilesetResolver = vision.FilesetResolver;
        const FaceDetector = vision.FaceDetector;
        
        const visionBase = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        faceDetector = await FaceDetector.createFromOptions(visionBase, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
                delegate: "GPU"
            },
            runningMode: "VIDEO"
        });
        console.log("Face Detector initialized");
        document.getElementById('faceGuideOverlay').classList.remove('hidden');
    } catch(err) {
        console.error("Face detection init error:", err);
    }
}

function detectFaceLoop() {
    if (!faceDetector || !cameraVideo || cameraVideo.paused || isCapturing) {
        if (isCapturing) {
            document.getElementById('faceGuideOverlay').classList.add('hidden');
        }
        return;
    }
    
    try {
        const results = faceDetector.detectForVideo(cameraVideo, performance.now());
        updateFaceGuide(results.detections);
    } catch(e) {}
    
    faceDetectionRAF = requestAnimationFrame(detectFaceLoop);
}

function updateFaceGuide(detections) {
    const oval = document.getElementById('faceGuideOval');
    const hint = document.getElementById('faceHint');
    if (!oval || !hint) return;
    
    if (!detections || detections.length === 0) {
        hint.textContent = "Đưa khuôn mặt vào khung";
        oval.classList.remove('aligned');
        hint.classList.remove('aligned');
        isFaceAligned = false;
        alignTime = 0;
        return;
    }
    
    const face = detections[0].boundingBox; 
    const vW = cameraVideo.videoWidth;
    const vH = cameraVideo.videoHeight;
    
    const faceCenterX = face.originX + face.width / 2;
    const faceCenterY = face.originY + face.height / 2;
    const targetX = vW / 2;
    const targetY = vH / 2;
    
    let diffX = faceCenterX - targetX;
    const diffY = faceCenterY - targetY;
    
    // If mirror mode, reverse diffX for correct hint mapping
    if (currentFacingMode === 'user') {
        diffX = -diffX;
    }
    
    const faceRatio = face.width / vW;
    let message = "";
    
    if (faceRatio < 0.12) {
        message = "Tiến gần hơn";
        isFaceAligned = false;
    } else if (faceRatio > 0.45) {
        message = "Lùi ra một chút";
        isFaceAligned = false;
    } else if (diffX < -vW * 0.15) {
        message = "Sang trái";
        isFaceAligned = false;
    } else if (diffX > vW * 0.15) {
        message = "Sang phải";
        isFaceAligned = false;
    } else if (diffY < -vH * 0.15) {
        message = "Nâng mặt lên";
        isFaceAligned = false;
    } else if (diffY > vH * 0.15) {
        message = "Hạ mặt xuống";
        isFaceAligned = false;
    } else {
        message = "Perfect!";
        isFaceAligned = true;
    }
    
    hint.textContent = message;
    
    if (isFaceAligned) {
        oval.classList.add('aligned');
        hint.classList.add('aligned');
        
        if (autoCaptureEnabled && !isCapturing && capturedImages.length > 0) {
            if (alignTime === 0) alignTime = Date.now();
            else if (Date.now() - alignTime > 1500) {
                startCountdown();
                alignTime = 0;
            }
        }
    } else {
        oval.classList.remove('aligned');
        hint.classList.remove('aligned');
        alignTime = 0;
    }
}
async function startCamera() {
    document.querySelector('.camera-loading').classList.remove('hidden');
    document.getElementById('cameraPlaceholder').classList.add('hidden');
    
    try {
        if (cameraStream) {
            stopCamera();
        }
        
        const constraints = {
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        };
        
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraVideo.srcObject = cameraStream;
        
        // Reset zoom UI on start
        currentZoom = 1;
        document.getElementById('zoomSlider').value = 1;
        document.getElementById('zoomLabel').textContent = '1.0x';
        applyVideoTransform();
        document.getElementById('zoomContainer').classList.remove('hidden');
        
        // Wait for video to load
        cameraVideo.onloadedmetadata = () => {
            document.querySelector('.camera-loading').classList.add('hidden');
            document.getElementById('btnStartCamera').classList.add('hidden');
            document.getElementById('btnCapture').classList.remove('hidden');
            btnCapture.disabled = false;
            
            if (faceDetector) {
                document.getElementById('faceGuideOverlay').classList.remove('hidden');
                detectFaceLoop();
            }
        };
        
    } catch (err) {
        console.error("Camera error:", err);
        document.querySelector('.camera-loading').classList.add('hidden');
        document.getElementById('cameraPlaceholder').classList.remove('hidden');
        showToast("Không thể mở camera. Vui lòng cấp quyền.");
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    if (faceDetectionRAF) {
        cancelAnimationFrame(faceDetectionRAF);
        faceDetectionRAF = null;
    }
    cameraVideo.srcObject = null;
    document.getElementById('zoomContainer').classList.add('hidden');
}

// ================= ZOOM LOGIC =================
function updateZoom(value) {
    currentZoom = parseFloat(value);
    document.getElementById('zoomLabel').textContent = currentZoom.toFixed(1) + 'x';
    document.getElementById('zoomSlider').value = currentZoom;
    applyVideoTransform();
}

function adjustZoom(delta) {
    let newZoom = currentZoom + delta;
    if (newZoom < 0.5) newZoom = 0.5;
    if (newZoom > 3) newZoom = 3;
    updateZoom(newZoom);
}

function applyVideoTransform() {
    if (!cameraVideo) return;
    const transformStr = `scale(${currentFacingMode === 'user' ? -currentZoom : currentZoom}, ${currentZoom})`;
    cameraVideo.style.transform = transformStr;
    const bgCanvas = document.getElementById('bgCanvas');
    if (bgCanvas) bgCanvas.style.transform = transformStr;
}

function switchCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    applyVideoTransform();
    startCamera();
}

function updateShotCounter() {
    shotCounter.textContent = `Đã chụp ${capturedImages.length}/6`;
    
    // Update thumbnails
    thumbnailsContainer.innerHTML = '';
    capturedImages.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'thumb-item';
        thumbnailsContainer.appendChild(img);
    });
}

// Giọng nói đếm ngược tiếng Việt sử dụng Web Speech API
function speakVietnamese(text) {
    if ('speechSynthesis' in window) {
        // Hủy bất kỳ giọng nói nào đang phát trước đó để tránh đè âm thanh
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        
        // Cố gắng tìm giọng đọc tiếng Việt chuẩn
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(voice => voice.lang.includes('vi'));
        if (viVoice) {
            utterance.voice = viVoice;
        }
        
        utterance.rate = 1.3; // Tăng tốc độ đọc một chút cho đúng nhịp đếm ngược
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

function startCountdown() {
    if (isCapturing) return;
    isCapturing = true;
    btnCapture.disabled = true;
    
    const selectedTimer = captureTimer;
    
    if (selectedTimer === 0) {
        capturePhoto();
        return;
    }
    
    let counter = selectedTimer;
    countdownEl.textContent = counter;
    countdownEl.classList.remove('hidden');
    countdownEl.classList.add('pop');
    
    // Đọc số đầu tiên
    speakVietnamese(counter.toString());
    
    const timer = setInterval(() => {
        counter--;
        
        if (counter > 0) {
            countdownEl.textContent = counter;
            countdownEl.classList.remove('pop');
            void countdownEl.offsetWidth; // trigger reflow
            countdownEl.classList.add('pop');
            
            // Đọc số tiếp theo
            speakVietnamese(counter.toString());
        } else {
            clearInterval(timer);
            countdownEl.classList.add('hidden');
            capturePhoto();
        }
    }, 1000);
}


function drawVideoCoverToCanvas(video, canvas, isMirror = true) {
    const ctx = canvas.getContext('2d');
    const srcW = video.videoWidth || video.width;
    const srcH = video.videoHeight || video.height;
    const videoRatio = srcW / srcH;
    const canvasRatio = canvas.width / canvas.height;
    
    let drawW, drawH, drawX, drawY;
    
    if (videoRatio > canvasRatio) {
        drawH = canvas.height;
        drawW = canvas.height * videoRatio;
        drawX = (canvas.width - drawW) / 2;
        drawY = 0;
    } else {
        drawW = canvas.width;
        drawH = canvas.width / videoRatio;
        drawX = 0;
        drawY = (canvas.height - drawH) / 2;
    }
    
    ctx.save();
    
    // Apply zoom scale from center
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(currentZoom, currentZoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    
    if (isMirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    
    const filterObj = CAMERA_FILTERS[activeCameraFilter];
    ctx.filter = filterObj.css;
    
    // Simulate beauty smoothing using globalAlpha hack
    if (filterObj.beauty.smoothing > 0) {
        ctx.drawImage(video, drawX, drawY, drawW, drawH);
        
        ctx.globalAlpha = filterObj.beauty.smoothing;
        ctx.filter = 'blur(4px)';
        ctx.drawImage(video, drawX, drawY, drawW, drawH);
        
        ctx.globalAlpha = 1.0;
        ctx.filter = 'none';
        
        if (filterObj.beauty.brightenFace > 0) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = filterObj.beauty.brightenFace;
            ctx.drawImage(video, drawX, drawY, drawW, drawH);
            ctx.globalCompositeOperation = 'source-over';
        }
    } else {
        ctx.drawImage(video, drawX, drawY, drawW, drawH);
    }
    
    ctx.globalAlpha = 1.0;
    
    // Draw Overlay color
    if (filterObj.overlay && filterObj.overlay !== 'transparent') {
        ctx.fillStyle = filterObj.overlay;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.restore();
}

function capturePhoto() {
    // Flash effect
    flashEl.classList.add('active');
    setTimeout(() => flashEl.classList.remove('active'), 300);
    
    // Play beep sound instead of shutter click
    if(beepAudio.readyState >= 2) {
        beepAudio.currentTime = 0;
        beepAudio.play().catch(e => console.log(e));
    }
    
    // Capture 3:4 canvas
    captureCanvas.width = 900;
    captureCanvas.height = 1200;
    
    const isMirror = currentFacingMode === 'user';
    const sourceElement = currentVirtualBackground !== 'none' ? document.getElementById('bgCanvas') : cameraVideo;
    drawVideoCoverToCanvas(sourceElement, captureCanvas, isMirror);
    
    const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
    capturedImages.push(dataUrl);
    
    updateShotCounter();
    
    if (capturedImages.length >= 6) {
        setTimeout(() => {
            stopCamera();
            goToSelection();
        }, 1000);
    } else {
        isCapturing = false;
        btnCapture.disabled = false;
        
        // Tự động kích hoạt đếm ngược chụp tấm tiếp theo sau 2 giây chuẩn bị dáng
        setTimeout(() => {
            if (cameraStream && screens.camera.classList.contains('active') && !isCapturing) {
                startCountdown();
            }
        }, 2000); // 2000ms (2 giây) chuẩn bị tạo dáng mới
    }
}

function resetShoot() {
    capturedImages = [];
    selectedImages = [];
    selectedSelectionIndices = [];
    isCapturing = false;
    
    // Tắt tự động chụp để chờ người dùng tự bấm chụp
    autoCaptureEnabled = false;
    const autoToggle = document.getElementById('autoCaptureToggle');
    if (autoToggle) autoToggle.checked = false;
    
    updateShotCounter();
    if (screens.editor.classList.contains('active') || screens.selection.classList.contains('active')) {
        draggableElements = [];
        renderInteractiveElements();
        switchScreen('camera');
        startCamera();
    }
}

// ================= SELECTION SCREEN =================
function goToSelection() {
    switchScreen('selection');
    selectedSelectionIndices = [];
    
    // Cập nhật tiêu đề hướng dẫn chọn ảnh
    const subtitle = document.getElementById('selectionSubtitle');
    subtitle.textContent = `Chọn 0/${maxImages} bức ảnh bạn thích nhất ✨`;
    
    document.getElementById('btnConfirmSelection').disabled = true;
    
    renderSelectionGrid();
}

function renderSelectionGrid() {
    const grid = document.getElementById('photoSelectionGrid');
    grid.innerHTML = '';
    
    capturedImages.forEach((src, index) => {
        const card = document.createElement('div');
        card.className = 'selection-card';
        card.onclick = () => toggleSelectPhoto(index);
        
        const img = document.createElement('img');
        img.src = src;
        card.appendChild(img);
        
        const num = document.createElement('div');
        num.className = 'selection-number';
        
        const selectedIndex = selectedSelectionIndices.indexOf(index);
        if (selectedIndex > -1) {
            card.classList.add('selected');
            num.textContent = selectedIndex + 1;
        } else {
            num.textContent = '';
        }
        card.appendChild(num);
        
        grid.appendChild(card);
    });
}

function toggleSelectPhoto(index) {
    const selIndex = selectedSelectionIndices.indexOf(index);
    if (selIndex > -1) {
        // Bỏ chọn
        selectedSelectionIndices.splice(selIndex, 1);
    } else {
        // Chọn
        if (selectedSelectionIndices.length < maxImages) {
            selectedSelectionIndices.push(index);
        } else {
            // Đã đạt giới hạn: tự động bỏ phần tử đầu tiên và thêm mới vào sau
            selectedSelectionIndices.shift();
            selectedSelectionIndices.push(index);
        }
    }
    
    // Cập nhật số lượng ảnh đã chọn
    const subtitle = document.getElementById('selectionSubtitle');
    subtitle.textContent = `Chọn ${selectedSelectionIndices.length}/${maxImages} bức ảnh bạn thích nhất ✨`;
    
    // Bật/tắt nút Xác nhận
    const btn = document.getElementById('btnConfirmSelection');
    if (selectedSelectionIndices.length === maxImages) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
    
    renderSelectionGrid();
}

function confirmPhotoSelection() {
    if (selectedSelectionIndices.length !== maxImages) return;
    
    // Gán danh sách ảnh được chọn theo thứ tự người dùng nhấp chọn
    selectedImages = selectedSelectionIndices.map(idx => capturedImages[idx]);
    goToEditor();
}

// ================= EDITOR SCREEN =================
function goToEditor() {
    switchScreen('editor');
    renderPhotobooth();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).style.display = 'block';
}

function renderStickers() {
    const list = document.getElementById('stickerList');
    list.innerHTML = '';
    stickersList.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.onclick = () => addSticker(emoji);
        list.appendChild(span);
    });
}

function addSticker(emoji) {
    const el = {
        type: 'sticker',
        content: emoji,
        x: interactiveLayer.offsetWidth / 2,
        y: interactiveLayer.offsetHeight / 2,
        fontSize: 60,
        rotation: 0
    };
    draggableElements.push(el);
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
}

function addText() {
    const input = document.getElementById('textInput');
    if (!input.value.trim()) return;
    
    const font = document.getElementById('fontSelect').value;
    const color = document.getElementById('textColor').value;
    const size = parseInt(document.getElementById('textSize').value) || 30;
    
    const el = {
        type: 'text',
        content: input.value,
        x: interactiveLayer.offsetWidth / 2,
        y: interactiveLayer.offsetHeight / 2,
        fontSize: size,
        font: font,
        color: color,
        weight: '700',
        italic: false,
        rotation: 0,
        opacity: 1,
        strokeColor: '#000000',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 0
    };
    
    draggableElements.push(el);
    input.value = '';
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
}

function quickAddText(text) {
    const el = {
        type: 'text',
        content: text,
        x: interactiveLayer.offsetWidth / 2,
        y: interactiveLayer.offsetHeight * 0.8,
        fontSize: 36,
        font: 'Pacifico',
        color: '#ff5fb7',
        weight: '400',
        italic: false,
        rotation: 0,
        opacity: 1,
        strokeColor: '#000000',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 4
    };
    draggableElements.push(el);
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
}

function setTextColor(color) {
    document.getElementById('textColor').value = color;
    updateSelectedTextProperty('color', color);
}

function toggleTextBold() {
    if (selectedElementIndex > -1 && draggableElements[selectedElementIndex].type === 'text') {
        const el = draggableElements[selectedElementIndex];
        el.weight = el.weight === '700' ? '400' : '700';
        document.getElementById('toggleBold').classList.toggle('active', el.weight === '700');
        renderInteractiveElements();
    }
}

function toggleTextItalic() {
    if (selectedElementIndex > -1 && draggableElements[selectedElementIndex].type === 'text') {
        const el = draggableElements[selectedElementIndex];
        el.italic = !el.italic;
        document.getElementById('toggleItalic').classList.toggle('active', el.italic);
        renderInteractiveElements();
    }
}

function setTextInput(text) {
    const input = document.getElementById('textInput');
    input.value = text;
    updateSelectedTextProperty('content', text);
}

function updateSelectedTextProperty(prop, value) {
    if (selectedElementIndex > -1) {
        const el = draggableElements[selectedElementIndex];
        if (el.type === 'text') {
            el[prop] = value;
            renderInteractiveElements();
        }
    }
}

function setFrameBg(bg) {
    frameBg = bg;
    renderPhotobooth();
}

function applyFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.filter-btn[onclick="applyFilter('${filter}')"]`).classList.add('active');
    updateCanvasCSS();
}

function setOverlay(overlay) {
    currentOverlay = overlay;
    document.querySelectorAll('.effect-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.effect-btn[onclick="setOverlay('${overlay}')"]`).classList.add('active');
    renderPhotobooth(); // overlay is drawn on canvas
}

function toggleDateStamp() {
    showDateStamp = document.getElementById('dateStampToggle').checked;
    renderPhotobooth();
}

function updateAdjustments() {
    adjustments.brightness = document.getElementById('adj-brightness').value;
    adjustments.contrast = document.getElementById('adj-contrast').value;
    adjustments.saturation = document.getElementById('adj-saturation').value;
    adjustments.blur = document.getElementById('adj-blur').value;
    updateCanvasCSS();
}

function updateCanvasCSS() {
    // Generate CSS filter string
    let cssFilter = `
        brightness(${adjustments.brightness}%) 
        contrast(${adjustments.contrast}%) 
        saturate(${adjustments.saturation}%) 
        blur(${adjustments.blur}px)
    `;
    
    switch (currentFilter) {
        case 'beauty': cssFilter += ' blur(0.5px) brightness(110%) saturate(110%)'; break;
        case 'vintage': cssFilter += ' sepia(50%) contrast(120%) brightness(90%) hue-rotate(-10deg)'; break;
        case 'film': cssFilter += ' contrast(130%) saturate(80%) sepia(20%)'; break;
        case 'bw': cssFilter += ' grayscale(100%) contrast(110%)'; break;
        case 'warm': cssFilter += ' sepia(30%) saturate(120%) hue-rotate(-10deg)'; break;
        case 'cool': cssFilter += ' hue-rotate(180deg) saturate(90%) brightness(105%)'; break;
        case 'pink': cssFilter += ' hue-rotate(300deg) saturate(120%) brightness(110%)'; break;
        case 'sepia': cssFilter += ' sepia(100%)'; break;
        case 'contrast': cssFilter += ' contrast(150%) saturate(110%)'; break;
        case 'dreamy': cssFilter += ' blur(1px) brightness(120%) saturate(110%) contrast(90%)'; break;
        default: break;
    }
    
    finalCanvas.style.filter = cssFilter;
}

// ================= CANVAS RENDERING =================
async function renderPhotobooth() {
    const ctx = finalCanvas.getContext('2d');
    
    // Define dimensions based on layout
    let width, height;
    let imgRects = []; // {x, y, w, h}
    
    const padding = 40;
    const spacing = 30;
    const imgWidth = 600;
    const imgHeight = 400;

    if (selectedLayout === '2-strip') {
        width = imgWidth + padding * 2;
        height = (imgHeight * 2) + spacing + padding * 3; // Extra padding at bottom for branding
        
        imgRects = [
            { x: padding, y: padding, w: imgWidth, h: imgHeight },
            { x: padding, y: padding + imgHeight + spacing, w: imgWidth, h: imgHeight }
        ];
    } 
    else if (selectedLayout === '4-strip') {
        width = imgWidth + padding * 2;
        height = (imgHeight * 4) + (spacing * 3) + padding * 3;
        
        for (let i = 0; i < 4; i++) {
            imgRects.push({
                x: padding, 
                y: padding + i * (imgHeight + spacing), 
                w: imgWidth, 
                h: imgHeight
            });
        }
    } 
    else if (selectedLayout === '2x2-grid') {
        width = (imgWidth * 2) + spacing + padding * 2;
        height = (imgHeight * 2) + spacing + padding * 3;
        
        imgRects = [
            { x: padding, y: padding, w: imgWidth, h: imgHeight },
            { x: padding + imgWidth + spacing, y: padding, w: imgWidth, h: imgHeight },
            { x: padding, y: padding + imgHeight + spacing, w: imgWidth, h: imgHeight },
            { x: padding + imgWidth + spacing, y: padding + imgHeight + spacing, w: imgWidth, h: imgHeight }
        ];
    }
    
    finalCanvas.width = width;
    finalCanvas.height = height;
    
    // Size interactive layer exactly to match canvas rendered size
    interactiveLayer.style.width = width + 'px';
    interactiveLayer.style.height = height + 'px';
    
    // Scale down visual display via CSS to fit container, but keep logical coords matching
    const wrapper = document.getElementById('canvasWrapper');
    const scale = Math.min(
        (wrapper.clientWidth - 40) / width, 
        (wrapper.clientHeight - 40) / height
    );
    
    finalCanvas.style.width = `${width * scale}px`;
    finalCanvas.style.height = `${height * scale}px`;
    interactiveLayer.style.transform = `translate(-50%, -50%) scale(${scale})`;
    
    // 1. Draw Background
    const bgToUse = selectedTheme ? selectedTheme.bg : frameBg;
    
    if (bgToUse.startsWith('linear-gradient')) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        // Parse colors from gradient string
        const colorMatches = bgToUse.match(/#[0-9a-fA-F]{3,6}/g);
        if (colorMatches && colorMatches.length >= 2) {
            colorMatches.forEach((c, i) => gradient.addColorStop(i / (colorMatches.length - 1), c));
        } else {
            gradient.addColorStop(0, '#b56cff');
            gradient.addColorStop(1, '#ff5fb7');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = bgToUse;
        ctx.fillRect(0, 0, width, height);
    }

    // 1b. Draw Effects / Overlay on the background (behind photos)
    if (currentOverlay !== 'none') {
        drawOverlay(ctx, width, height, currentOverlay);
    }
    
    // 1c. Draw themed decorations (behind photos)
    if (selectedTheme && selectedTheme.decos) {
        drawThemedDecorations(ctx, width, height, selectedTheme.decos);
    }

    // 2. Draw Images (Object-fit cover)
    for (let i = 0; i < maxImages; i++) {
        if (!selectedImages[i]) continue;
        
        const rect = imgRects[i];
        
        const img = new Image();
        img.src = selectedImages[i];
        await new Promise(r => img.onload = r);
        
        // Draw themed border if applicable
        if (selectedTheme && selectedTheme.borderColor) {
            ctx.save();
            ctx.strokeStyle = selectedTheme.borderColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, 17);
            ctx.stroke();
            ctx.restore();
        }
        
        // Draw with border radius simulation using clipping
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 15);
        ctx.clip();
        
        // calculate cover
        const imgAspect = img.width / img.height;
        const rectAspect = rect.w / rect.h;
        
        let drawW, drawH, drawX, drawY;
        
        if (imgAspect > rectAspect) {
            drawH = rect.h;
            drawW = img.width * (rect.h / img.height);
            drawX = rect.x - (drawW - rect.w) / 2;
            drawY = rect.y;
        } else {
            drawW = rect.w;
            drawH = img.height * (rect.w / img.width);
            drawX = rect.x;
            drawY = rect.y - (drawH - rect.h) / 2;
        }
        
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
    }
    
    // 3. Draw Branding & Date
    const brandingText = selectedTheme ? selectedTheme.textDefault : 'Photobooth Pro';
    const textColor = selectedTheme ? (selectedTheme.borderColor || '#fff') : getTextColorForBg(bgToUse);
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    
    ctx.font = 'bold 30px "Syne", sans-serif';
    ctx.fillText(brandingText, width / 2, height - padding / 1.5);
    
    if (showDateStamp) {
        const date = new Date();
        const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
        ctx.font = '500 20px "Space Grotesk", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, width - padding, height - padding / 1.5);
    }
    
    // 3b. Draw themed decorations on top (foreground)
    if (selectedTheme && selectedTheme.decos) {
        drawThemedDecorationsTop(ctx, width, height, selectedTheme.decos);
    }
}

// Utility to determine if text should be white or black based on bg
function getTextColorForBg(bg) {
    if (bg === '#ffffff' || bg === '#ffd1dc' || bg === '#aaffc3' || bg === '#fffacd') return '#000000';
    return '#ffffff';
}

// Draw themed emoji decorations behind photos
function drawThemedDecorations(ctx, w, h, decos) {
    ctx.save();
    // Seeded random for consistent layout
    let seed = 42;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    
    for (let i = 0; i < 25; i++) {
        const emoji = decos[Math.floor(rng() * decos.length)];
        ctx.save();
        ctx.globalAlpha = 0.15 + rng() * 0.15;
        ctx.translate(rng() * w, rng() * h);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.font = `${20 + rng() * 30}px sans-serif`;
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
    }
    ctx.restore();
}

// Draw themed emoji decorations on top (foreground corners & edges)
function drawThemedDecorationsTop(ctx, w, h, decos) {
    ctx.save();
    const size = 28;
    ctx.font = `${size}px sans-serif`;
    ctx.globalAlpha = 0.9;
    
    // Top-left corner cluster
    decos.forEach((emoji, i) => {
        ctx.fillText(emoji, 8 + i * 30, 30);
    });
    
    // Top-right corner
    decos.forEach((emoji, i) => {
        ctx.fillText(emoji, w - 35 - i * 30, 30);
    });
    
    // Bottom-left
    ctx.fillText(decos[0], 10, h - 55);
    if (decos[1]) ctx.fillText(decos[1], 40, h - 55);
    
    // Bottom-right
    ctx.fillText(decos[decos.length - 1], w - 35, h - 55);
    
    ctx.restore();
}

function drawOverlay(ctx, w, h, type) {
    ctx.save();
    
    if (type === 'sparkle') {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for(let i=0; i<50; i++) {
            ctx.beginPath();
            ctx.arc(Math.random()*w, Math.random()*h, Math.random()*3, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (type === 'grain') {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for(let i=0; i<w; i+=4) {
            for(let j=0; j<h; j+=4) {
                if(Math.random() > 0.5) ctx.fillRect(i, j, 2, 2);
            }
        }
    } else if (['hearts', 'stars', 'flowers', 'butterflies', 'music'].includes(type)) {
        let char = '❤️';
        if (type === 'stars') char = '⭐';
        if (type === 'flowers') char = '🌸';
        if (type === 'butterflies') char = '🦋';
        if (type === 'music') char = '🎵';
        
        for(let i=0; i<40; i++) {
            ctx.save();
            ctx.translate(Math.random()*w, Math.random()*h);
            ctx.rotate(Math.random() * Math.PI * 2);
            const size = 15 + Math.random() * 25;
            ctx.font = `${size}px Arial`;
            ctx.fillText(char, 0, 0);
            ctx.restore();
        }
    } else if (type === 'bubbles') {
        for(let i=0; i<50; i++) {
            const bx = Math.random()*w;
            const by = Math.random()*h;
            const br = 10 + Math.random()*25;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Add tiny highlight to bubble
            ctx.beginPath();
            ctx.arc(bx - br*0.3, by - br*0.3, br*0.15, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fill();
        }
    }
    
    ctx.restore();
}


// ================= DRAG & DROP ELEMENTS (HTML Overlay Layer) =================
function setupInteractiveLayer() {
    interactiveLayer.addEventListener('mousedown', handleDragStart);
    interactiveLayer.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    
    // Touch support
    interactiveLayer.addEventListener('touchstart', handleDragStart, {passive: false});
    interactiveLayer.addEventListener('touchmove', handleDragMove, {passive: false});
    window.addEventListener('touchend', handleDragEnd);
}

function renderInteractiveElements() {
    interactiveLayer.innerHTML = '';
    
    draggableElements.forEach((el, index) => {
        const div = document.createElement('div');
        div.className = `draggable-element ${index === selectedElementIndex ? 'selected' : ''}`;
        div.dataset.index = index;
        
        div.style.left = `${el.x}px`;
        div.style.top = `${el.y}px`;
        div.style.transform = `translate(-50%, -50%) rotate(${el.rotation}deg)`;
        
        if (el.type === 'sticker') {
            div.style.fontSize = `${el.fontSize}px`;
            div.textContent = el.content;
        } else if (el.type === 'text') {
            div.style.fontSize = `${el.fontSize}px`;
            div.style.fontFamily = el.font;
            div.style.color = el.color;
            div.style.fontWeight = el.weight || '700';
            div.style.fontStyle = el.italic ? 'italic' : 'normal';
            div.style.opacity = el.opacity !== undefined ? el.opacity : 1;
            if (el.strokeWidth > 0) {
                div.style.webkitTextStroke = `${el.strokeWidth}px ${el.strokeColor || '#000'}`;
            }
            if (el.shadowBlur > 0) {
                div.style.textShadow = `0 0 ${el.shadowBlur}px ${el.shadowColor || '#000'}`;
            }
            div.textContent = el.content;
        }
        
        // Add resize handle
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        div.appendChild(handle);
        
        interactiveLayer.appendChild(div);
    });
    
    const controls = document.getElementById('elementControls');
    if (selectedElementIndex >= 0 && selectedElementIndex < draggableElements.length) {
        controls.classList.remove('hidden');
    } else {
        controls.classList.add('hidden');
    }
}

function selectElement(index) {
    selectedElementIndex = index;
    renderInteractiveElements();
    
    // Auto-fill controls if text is selected
    if (index > -1 && draggableElements[index].type === 'text') {
        const el = draggableElements[index];
        document.getElementById('textInput').value = el.content;
        document.getElementById('fontSelect').value = el.font;
        document.getElementById('textColor').value = el.color;
        document.getElementById('textSize').value = el.fontSize;
        document.getElementById('fontSizeVal').textContent = el.fontSize;
        document.getElementById('textStroke').value = el.strokeWidth || 0;
        document.getElementById('strokeVal').textContent = el.strokeWidth || 0;
        document.getElementById('strokeColor').value = el.strokeColor || '#000000';
        document.getElementById('textShadow').value = el.shadowBlur || 0;
        document.getElementById('shadowVal').textContent = el.shadowBlur || 0;
        document.getElementById('shadowColor').value = el.shadowColor || '#000000';
        document.getElementById('textOpacity').value = (el.opacity || 1) * 100;
        document.getElementById('opacityVal').textContent = Math.round((el.opacity || 1) * 100);
        document.getElementById('textRotation').value = el.rotation || 0;
        document.getElementById('rotationVal').textContent = el.rotation || 0;
        document.getElementById('toggleBold').classList.toggle('active', el.weight === '700');
        document.getElementById('toggleItalic').classList.toggle('active', el.italic === true);
        
        // Auto-switch to text tab
        switchTab('text');
    }
}

function deleteSelectedElement() {
    if (selectedElementIndex > -1) {
        draggableElements.splice(selectedElementIndex, 1);
        selectedElementIndex = -1;
        renderInteractiveElements();
    }
}

// Drag logic
let actionType = null; // 'drag' or 'resize'
let initialDist = 0;
let initialSize = 0;

function handleDragStart(e) {
    const target = e.target;
    
    // Find parent draggable if clicked on text/child
    const draggable = target.closest('.draggable-element');
    
    if (target.classList.contains('resize-handle')) {
        e.preventDefault();
        actionType = 'resize';
        const elDiv = target.closest('.draggable-element');
        selectedElementIndex = parseInt(elDiv.dataset.index);
        
        const evt = e.touches ? e.touches[0] : e;
        dragStartX = evt.clientX;
        dragStartY = evt.clientY;
        initialSize = draggableElements[selectedElementIndex].fontSize;
        
        selectElement(selectedElementIndex);
        return;
    }
    
    if (draggable) {
        e.preventDefault();
        actionType = 'drag';
        selectedElementIndex = parseInt(draggable.dataset.index);
        isDragging = true;
        
        const evt = e.touches ? e.touches[0] : e;
        // Calculate offset within the element
        const rect = draggable.getBoundingClientRect();
        
        dragStartX = evt.clientX;
        dragStartY = evt.clientY;
        
        selectElement(selectedElementIndex);
    } else {
        // Clicked outside
        selectElement(-1);
    }
}

function handleDragMove(e) {
    if (selectedElementIndex === -1 || !actionType) return;
    
    e.preventDefault();
    const evt = e.touches ? e.touches[0] : e;
    
    const deltaX = evt.clientX - dragStartX;
    const deltaY = evt.clientY - dragStartY;
    
    // Scale delta back to canvas logical coordinates
    const scale = interactiveLayer.getBoundingClientRect().width / finalCanvas.width;
    
    const el = draggableElements[selectedElementIndex];
    
    if (actionType === 'drag') {
        el.x += deltaX / scale;
        el.y += deltaY / scale;
        dragStartX = evt.clientX;
        dragStartY = evt.clientY;
    } else if (actionType === 'resize') {
        // Simple resize based on drag distance
        const sign = (deltaX > 0 || deltaY > 0) ? 1 : (deltaX < 0 && deltaY < 0 ? -1 : (deltaX - deltaY > 0 ? 1 : -1));
        const dist = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
        el.fontSize = Math.max(10, el.fontSize + (dist/scale) * sign * 0.5);
        dragStartX = evt.clientX;
        dragStartY = evt.clientY;
    }
    
    renderInteractiveElements();
}

function handleDragEnd(e) {
    isDragging = false;
    actionType = null;
}

// ================= DOWNLOAD =================
function downloadImage() {
    selectElement(-1); // Deselect elements so handles don't render
    
    // We need to render the HTML draggable elements onto the actual canvas before downloading.
    // Create an offscreen canvas to combine everything
    const dlCanvas = document.createElement('canvas');
    dlCanvas.width = finalCanvas.width;
    dlCanvas.height = finalCanvas.height;
    const ctx = dlCanvas.getContext('2d');
    
    // 1. Draw the base canvas (which has bg, images, overlays)
    // NOTE: We need to apply CSS filters manually to the downloaded canvas!
    ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px)`;
    
    // Add specific filter styles
    switch (currentFilter) {
        case 'beauty': ctx.filter += ' blur(0.5px) brightness(110%) saturate(110%)'; break;
        case 'vintage': ctx.filter += ' sepia(50%) contrast(120%) brightness(90%) hue-rotate(-10deg)'; break;
        case 'film': ctx.filter += ' contrast(130%) saturate(80%) sepia(20%)'; break;
        case 'bw': ctx.filter += ' grayscale(100%) contrast(110%)'; break;
        case 'warm': ctx.filter += ' sepia(30%) saturate(120%) hue-rotate(-10deg)'; break;
        case 'cool': ctx.filter += ' hue-rotate(180deg) saturate(90%) brightness(105%)'; break;
        case 'pink': ctx.filter += ' hue-rotate(300deg) saturate(120%) brightness(110%)'; break;
        case 'sepia': ctx.filter += ' sepia(100%)'; break;
        case 'contrast': ctx.filter += ' contrast(150%) saturate(110%)'; break;
        case 'dreamy': ctx.filter += ' blur(1px) brightness(120%) saturate(110%) contrast(90%)'; break;
    }
    
    ctx.drawImage(finalCanvas, 0, 0);
    ctx.filter = 'none'; // reset filter for text/stickers
    
    // 2. Draw draggable elements
    draggableElements.forEach(el => {
        ctx.save();
        ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
        ctx.translate(el.x, el.y);
        ctx.rotate((el.rotation || 0) * Math.PI / 180);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (el.type === 'sticker') {
            ctx.font = `${el.fontSize}px sans-serif`;
            ctx.fillText(el.content, 0, 0);
        } else if (el.type === 'text') {
            const italic = el.italic ? 'italic ' : '';
            const weight = el.weight || '700';
            ctx.font = `${italic}${weight} ${el.fontSize}px "${el.font}", sans-serif`;
            
            if (el.shadowBlur > 0) {
                ctx.shadowColor = el.shadowColor || '#000';
                ctx.shadowBlur = el.shadowBlur;
            }
            
            if (el.strokeWidth > 0) {
                ctx.strokeStyle = el.strokeColor || '#000';
                ctx.lineWidth = el.strokeWidth * 2;
                ctx.strokeText(el.content, 0, 0);
            }
            
            ctx.fillStyle = el.color;
            ctx.fillText(el.content, 0, 0);
        }
        
        ctx.restore();
    });
    
    // Trigger download
    const link = document.createElement('a');
    link.download = `photobooth-pro-${Date.now()}.png`;
    link.href = dlCanvas.toDataURL('image/png', 1.0);
    link.click();
    
    showToast('Tải ảnh thành công! 🎉');
}

// ================= SHARE =================
async function shareFinalImage() {
    try {
        const dataUrl = getFinalImageDataUrl();
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'photobooth-pro.png', { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Photobooth Pro',
                text: 'Ảnh photobooth của tôi ✨'
            });
        } else {
            showToast('Trình duyệt chưa hỗ trợ chia sẻ trực tiếp. Đã tải ảnh về máy.');
            downloadImage();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showToast('Không thể chia sẻ. Đã tải ảnh về máy.');
            downloadImage();
        }
    }
}

function getFinalImageDataUrl() {
    selectElement(-1);
    const dlCanvas = document.createElement('canvas');
    dlCanvas.width = finalCanvas.width;
    dlCanvas.height = finalCanvas.height;
    const ctx = dlCanvas.getContext('2d');
    
    ctx.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px)`;
    switch (currentFilter) {
        case 'beauty': ctx.filter += ' blur(0.5px) brightness(110%) saturate(110%)'; break;
        case 'vintage': ctx.filter += ' sepia(50%) contrast(120%) brightness(90%) hue-rotate(-10deg)'; break;
        case 'film': ctx.filter += ' contrast(130%) saturate(80%) sepia(20%)'; break;
        case 'bw': ctx.filter += ' grayscale(100%) contrast(110%)'; break;
        case 'warm': ctx.filter += ' sepia(30%) saturate(120%) hue-rotate(-10deg)'; break;
        case 'cool': ctx.filter += ' hue-rotate(180deg) saturate(90%) brightness(105%)'; break;
        case 'pink': ctx.filter += ' hue-rotate(300deg) saturate(120%) brightness(110%)'; break;
        case 'sepia': ctx.filter += ' sepia(100%)'; break;
        case 'contrast': ctx.filter += ' contrast(150%) saturate(110%)'; break;
        case 'dreamy': ctx.filter += ' blur(1px) brightness(120%) saturate(110%) contrast(90%)'; break;
    }
    ctx.drawImage(finalCanvas, 0, 0);
    ctx.filter = 'none';
    
    draggableElements.forEach(el => {
        ctx.save();
        ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
        ctx.translate(el.x, el.y);
        ctx.rotate((el.rotation || 0) * Math.PI / 180);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (el.type === 'sticker') {
            ctx.font = `${el.fontSize}px sans-serif`;
            ctx.fillText(el.content, 0, 0);
        } else if (el.type === 'text') {
            const italic = el.italic ? 'italic ' : '';
            const weight = el.weight || '700';
            ctx.font = `${italic}${weight} ${el.fontSize}px "${el.font}", sans-serif`;
            if (el.shadowBlur > 0) { ctx.shadowColor = el.shadowColor || '#000'; ctx.shadowBlur = el.shadowBlur; }
            if (el.strokeWidth > 0) { ctx.strokeStyle = el.strokeColor || '#000'; ctx.lineWidth = el.strokeWidth * 2; ctx.strokeText(el.content, 0, 0); }
            ctx.fillStyle = el.color;
            ctx.fillText(el.content, 0, 0);
        }
        ctx.restore();
    });
    
    return dlCanvas.toDataURL('image/png', 1.0);
}

// ================= QR CODE =================
function openQRModal() {
    const modal = document.getElementById('qrModal');
    modal.classList.remove('hidden');
    
    try {
        if (typeof QRCode === 'undefined') {
            showToast('Thư viện QR chưa tải xong. Vui lòng thử lại.');
            modal.classList.add('hidden');
            return;
        }
        
        const dataUrl = getFinalImageDataUrl();
        // dataURL too long for QR, use a small placeholder message
        if (dataUrl.length > 2000) {
            const qrCanvas = document.getElementById('qrCanvas');
            QRCode.toCanvas(qrCanvas, 'Photobooth Pro - Dùng nút Tải ảnh để lưu ảnh về máy', {
                width: 200,
                color: { dark: '#000', light: '#fff' }
            });
            showToast('Ảnh quá lớn để tạo QR trực tiếp. Vui lòng dùng nút tải ảnh.');
        } else {
            const qrCanvas = document.getElementById('qrCanvas');
            QRCode.toCanvas(qrCanvas, dataUrl, { width: 200 });
        }
    } catch (err) {
        showToast('Không thể tạo QR lúc này.');
        modal.classList.add('hidden');
    }
}

function closeQRModal() {
    document.getElementById('qrModal').classList.add('hidden');
}

// ================= GIF / BOOMERANG =================
async function createGif() {
    if (!selectedImages || selectedImages.length < 2) {
        showToast('Cần ít nhất 2 ảnh để tạo GIF.');
        return;
    }
    
    if (typeof GIF === 'undefined') {
        showToast('Thư viện GIF chưa tải được. Vui lòng thử lại.');
        return;
    }
    
    const gifModal = document.getElementById('gifModal');
    gifModal.classList.remove('hidden');
    document.getElementById('gifStatus').textContent = 'Đang tạo GIF...';
    
    try {
        const gif = new GIF({
            workers: 2,
            quality: 10,
            workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
        });
        
        for (const src of selectedImages) {
            const img = new Image();
            img.src = src;
            await new Promise(r => img.onload = r);
            
            const c = document.createElement('canvas');
            c.width = 400; c.height = 533;
            const cx = c.getContext('2d');
            const ratio = img.width / img.height;
            let dw, dh, dx, dy;
            if (ratio > c.width / c.height) { dh = c.height; dw = dh * ratio; dx = (c.width - dw) / 2; dy = 0; }
            else { dw = c.width; dh = dw / ratio; dx = 0; dy = (c.height - dh) / 2; }
            cx.drawImage(img, dx, dy, dw, dh);
            gif.addFrame(c, { delay: 400 });
        }
        
        gif.on('finished', function(blob) {
            gifModal.classList.add('hidden');
            const link = document.createElement('a');
            link.download = `photobooth-${Date.now()}.gif`;
            link.href = URL.createObjectURL(blob);
            link.click();
            showToast('GIF đã được tạo thành công! 🎉');
        });
        
        gif.render();
    } catch (err) {
        gifModal.classList.add('hidden');
        showToast('Không thể tạo GIF lúc này, vui lòng thử lại.');
    }
}

async function createBoomerang() {
    if (!selectedImages || selectedImages.length < 2) {
        showToast('Cần ít nhất 2 ảnh để tạo Boomerang.');
        return;
    }
    
    if (typeof GIF === 'undefined') {
        showToast('Thư viện GIF chưa tải được. Vui lòng thử lại.');
        return;
    }
    
    const gifModal = document.getElementById('gifModal');
    gifModal.classList.remove('hidden');
    document.getElementById('gifStatus').textContent = 'Đang tạo Boomerang...';
    
    try {
        // Create boomerang sequence: 1,2,3,4,3,2
        const boomerangSequence = [...selectedImages];
        for (let i = selectedImages.length - 2; i > 0; i--) {
            boomerangSequence.push(selectedImages[i]);
        }
        
        const gif = new GIF({
            workers: 2, quality: 10,
            workerScript: 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
        });
        
        for (const src of boomerangSequence) {
            const img = new Image();
            img.src = src;
            await new Promise(r => img.onload = r);
            
            const c = document.createElement('canvas');
            c.width = 400; c.height = 533;
            const cx = c.getContext('2d');
            const ratio = img.width / img.height;
            let dw, dh, dx, dy;
            if (ratio > c.width / c.height) { dh = c.height; dw = dh * ratio; dx = (c.width - dw) / 2; dy = 0; }
            else { dw = c.width; dh = dw / ratio; dx = 0; dy = (c.height - dh) / 2; }
            cx.drawImage(img, dx, dy, dw, dh);
            gif.addFrame(c, { delay: 250 });
        }
        
        gif.on('finished', function(blob) {
            gifModal.classList.add('hidden');
            const link = document.createElement('a');
            link.download = `photobooth-boomerang-${Date.now()}.gif`;
            link.href = URL.createObjectURL(blob);
            link.click();
            showToast('Boomerang đã được tạo thành công! 🎉');
        });
        
        gif.render();
    } catch (err) {
        gifModal.classList.add('hidden');
        showToast('Không thể tạo Boomerang lúc này, vui lòng thử lại.');
    }
}

// ================= UTILS =================
function switchScreen(screenId) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    screens[screenId].classList.add('active');
}

function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

// Init app
window.addEventListener('DOMContentLoaded', init);
