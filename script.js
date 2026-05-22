// ================= STATE VARIABLES =================
let selectedLayout = null; // '2-strip', '4-strip', '2x2-grid', '3-strip', 'polaroid', 'magazine'
let selectedTheme = null; // themed layout config object
let maxImages = 0;
let capturedImages = []; // Stores all 6 captured data URLs
let selectedImages = []; // Stores selected images to be put in template
let selectedSelectionIndices = []; // Indices of selected photos (from 0 to 5)
let cameraStream = null;
let currentFacingMode = 'user';
let isCapturing = false;
let currentZoom = 1;
let isPremiumUnlocked = false;
try { isPremiumUnlocked = localStorage.getItem('premiumUnlocked') === 'true'; } catch(e) {}
let isMirrorMode = false;
let actionType = null;

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
let faceAlignedSince = 0;
let isAutoCaptureWaiting = false;
let faceDetectionRAF = null;

// Editor State
let frameBg = '#ffffff';
let currentFilter = 'none';
let currentOverlay = 'none';
let showDateStamp = false;
let adjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0 };
let gifDelay = 400; // Delay of GIF/Boomerang in ms

// Draggable Elements (Stickers & Text)
let draggableElements = [];
let selectedElementIndex = -1;
let dragStartX = 0, dragStartY = 0;
let isDragging = false;

const stickersList = ['❤️','✨','🌸','🐰','🐱','⭐','💖','🎀','😍','🔥','🦋','🌈','☀️','🎈','🍬','🐶','👻','🎉','🍀','🍰'];

// DOM Elements
const screens = {
    layout: document.getElementById('layoutScreen'),
    camera: document.getElementById('cameraScreen'),
    selection: document.getElementById('selectionScreen'),
    editor: document.getElementById('editorScreen')
};

// Support State
let hasSeenSupportPopup = false;
let pendingThemeId = null;

const cameraVideo = document.getElementById('cameraVideo');
const countdownEl = document.getElementById('countdown');
const flashEl = document.getElementById('flash');
const captureCanvas = document.getElementById('captureCanvas');
const finalCanvas = document.getElementById('finalCanvas');
const interactiveLayer = document.getElementById('interactiveLayer');
const thumbnailsContainer = document.getElementById('shotThumbnails');
const btnEnterRoom = document.getElementById('btnEnterRoom');
const btnCapture = document.getElementById('btnCapture');
let shotCounter = document.querySelector('.shot-counter');
const toastEl = document.getElementById('toast');

const beepAudio = document.getElementById('beepAudio');
const shutterAudio = document.getElementById('shutterAudio');

// Virtual Backgrounds Preloading
const VBG_IMAGES = {
    'flower': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80',
    'cafe': 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80',
    'christmas': 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80',
    'tet-red': 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&q=80'
};
const loadedVbgImages = {};
let customBackgroundImage = null;

// ================= INIT =================
function init() {
    renderStickers();
    setupInteractiveLayer();
    setupTouchFallback();
    renderLiveFilters();
    initFaceDetection();
    preloadVirtualBackgrounds();
    
    // Prevent zoom on mobile double tap
    document.addEventListener('dblclick', function(event) {
        event.preventDefault();
    }, { passive: false });

    initPinchToZoom();
}

function preloadVirtualBackgrounds() {
    Object.entries(VBG_IMAGES).forEach(([key, url]) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            loadedVbgImages[key] = img;
        };
        img.src = url;
    });
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
            e.preventDefault(); // Prevent scrolling page
            const currentDistance = getPinchDistance(e);
            const scale = currentDistance / initialPinchDistance;
            let newZoom = initialZoom * scale;
            
            if (newZoom < 0.5) newZoom = 0.5;
            if (newZoom > 3) newZoom = 3;
            
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
const THEMED_LAYOUTS = {
    // Premium layouts
    'luxury-neon': { name: 'Luxury Neon', type: 'premium', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #150d22, #07030c)', borderColor: '#b56cff', decos: ['✨','💜','⭐','💖'], textDefault: 'Luxury Neon' },
    'pink-dream': { name: 'Pink Dream', type: 'premium', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #ffe0f0, #ffc0e0)', borderColor: '#ff69b4', decos: ['🌸','💕','🎀','🧸'], textDefault: 'Pink Dream' },
    'magazine-cover': { name: 'Magazine Cover', type: 'premium', photoCount: 1, baseLayout: 'magazine', bg: '#111111', borderColor: '#ffffff', decos: ['💄','💎','🔥','✨'], textDefault: 'PHOTOBOOTH' },
    'kawaii-booth': { name: 'Kawaii Booth', type: 'premium', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #fff0f5, #ffe4f0)', borderColor: '#ffb6c1', decos: ['🐰','🌟','🍭','🎀','🍦'], textDefault: 'Kawaii ♡' },
    'elegant-black': { name: 'Elegant Black', type: 'premium', photoCount: 2, baseLayout: '2-strip', bg: '#0a0a0a', borderColor: '#d4af37', decos: ['⭐','✨','👑'], textDefault: 'Elegant Black' },
    'soft-pastel': { name: 'Soft Pastel', type: 'premium', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #e8daef, #d5f5e3, #fdebd0)', borderColor: '#c39bd3', decos: ['🌈','🦋','☁️','🌸'], textDefault: 'Soft Pastel' },
    'couple-memories': { name: 'Couple Memories', type: 'premium', photoCount: 2, baseLayout: '2-strip', bg: 'linear-gradient(135deg, #fce4ec, #f8bbd0)', borderColor: '#e91e63', decos: ['❤️','💑','💕','🌹'], textDefault: 'Our Memories' },
    'best-friends': { name: 'Best Friends', type: 'premium', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #fff9c4, #f8bbd0)', borderColor: '#ff4081', decos: ['👭','💖','🌟','🌸'], textDefault: 'Besties Forever' },
    
    // Seasonal layouts
    'tet': { name: 'Tết Việt Nam', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #c62828, #ff8f00)', borderColor: '#ffd700', decos: ['🌺','🧧','🎊','🏮','🎋'], textDefault: 'Chúc Mừng Năm Mới' },
    'valentine': { name: 'Valentine', type: 'seasonal', photoCount: 2, baseLayout: '2-strip', bg: 'linear-gradient(135deg, #e91e63, #f48fb1)', borderColor: '#ff1744', decos: ['❤️','💕','💘','🌹','🥂'], textDefault: 'Happy Valentine' },
    'christmas': { name: 'Giáng Sinh', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #1b5e20, #b71c1c)', borderColor: '#ffffff', decos: ['🎄','⭐','❄️','🎁','🎅'], textDefault: 'Merry Christmas' },
    'halloween': { name: 'Halloween', type: 'seasonal', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #1a0a2e, #ff6f00)', borderColor: '#ff9800', decos: ['🎃','👻','🦇','🕷️','💀'], textDefault: 'Happy Halloween' },
    'birthday': { name: 'Sinh nhật', type: 'seasonal', photoCount: 4, baseLayout: '2x2-grid', bg: 'linear-gradient(135deg, #e1bee7, #bbdefb, #fff9c4)', borderColor: '#ff4081', decos: ['🎈','🎂','🎉','🎊','🍰'], textDefault: 'Happy Birthday!' },
    'trung-thu': { name: 'Trung thu', type: 'seasonal', photoCount: 3, baseLayout: '3-strip', bg: 'linear-gradient(135deg, #0d1b2a, #1b263b)', borderColor: '#ffb703', decos: ['🌕','🏮','🐇','🌾'], textDefault: 'Đêm Hội Trăng Rằm' },
    'summer': { name: 'Summer', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #e0f7fa, #fff9c4)', borderColor: '#00acc1', decos: ['🌊','🌴','☀️','🍹','🍍'], textDefault: 'Summer Vibe' },
    'graduation': { name: 'Graduation', type: 'seasonal', photoCount: 4, baseLayout: '4-strip', bg: 'linear-gradient(135deg, #1a1a2e, #d4af37)', borderColor: '#d4af37', decos: ['🎓','⭐','🏆','📜'], textDefault: 'Congratulations!' }
};

function switchLayoutCategory(category, btnEl) {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    btnEl.classList.add('active');
    
    document.getElementById('layoutCatFree').classList.add('hidden');
    document.getElementById('layoutCatPremium').classList.add('hidden');
    document.getElementById('layoutCatSeasonal').classList.add('hidden');
    document.getElementById(`layoutCat${category.charAt(0).toUpperCase() + category.slice(1)}`).classList.remove('hidden');
}

function selectThemeLayout(layoutId) {
    // 1. Basic Free Layouts
    if (layoutId === '2-strip' || layoutId === '4-strip' || layoutId === '2x2-grid') {
        selectedTheme = null;
        selectedLayout = layoutId;
        if (layoutId === '2-strip') maxImages = 2;
        else if (layoutId === '4-strip') maxImages = 4;
        else if (layoutId === '2x2-grid') maxImages = 4;
        
        document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
        const cardEl = document.querySelector(`.card[data-layout="${layoutId}"]`);
        if (cardEl) cardEl.classList.add('selected');
        btnEnterRoom.disabled = false;
        return;
    }
    
    // 2. Themed Free Layouts
    if (layoutId === 'polaroid-basic') {
        selectedTheme = {
            id: 'polaroid-basic',
            name: 'Polaroid Basic',
            type: 'free',
            photoCount: 1,
            baseLayout: 'polaroid',
            bg: '#fbfbf9',
            borderColor: '#e5e5e5',
            decos: [],
            textDefault: 'Polaroid'
        };
        selectedLayout = 'polaroid';
        maxImages = 1;
        
        document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
        const cardEl = document.querySelector(`.card[data-layout="${layoutId}"]`);
        if (cardEl) cardEl.classList.add('selected');
        btnEnterRoom.disabled = false;
        return;
    }
    
    if (layoutId === 'minimal-white') {
        selectedTheme = {
            id: 'minimal-white',
            name: 'Minimal White',
            type: 'free',
            photoCount: 3,
            baseLayout: '3-strip',
            bg: '#ffffff',
            borderColor: '#f2f2f2',
            decos: [],
            textDefault: 'Minimalist'
        };
        selectedLayout = '3-strip';
        maxImages = 3;
        
        document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
        const cardEl = document.querySelector(`.card[data-layout="${layoutId}"]`);
        if (cardEl) cardEl.classList.add('selected');
        btnEnterRoom.disabled = false;
        return;
    }

    // 3. Premium / Seasonal Layouts Lock validation
    if (!isPremiumUnlocked) {
        pendingThemeId = layoutId;
        document.getElementById('supportModal').classList.remove('hidden');
        return;
    }
    
    const theme = THEMED_LAYOUTS[layoutId];
    if (!theme) return;
    
    selectedTheme = { ...theme, id: layoutId };
    selectedLayout = theme.baseLayout;
    maxImages = theme.photoCount;
    
    document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
    const cardEl = document.querySelector(`.card[data-layout="${layoutId}"]`);
    if (cardEl) cardEl.classList.add('selected');
    
    btnEnterRoom.disabled = false;
}

function unlockPremium() {
    isPremiumUnlocked = true;
    try { localStorage.setItem('premiumUnlocked', 'true'); } catch(e) {}
    document.getElementById('supportModal').classList.add('hidden');
    showToast('Cảm ơn bạn đã ủng hộ! Premium đã được mở khóa 💖');
    
    if (pendingThemeId) {
        selectThemeLayout(pendingThemeId);
        pendingThemeId = null;
    }
}

function closeDonateModal() {
    document.getElementById('supportModal').classList.add('hidden');
    pendingThemeId = null;
}

function goToCamera() {
    if (!selectedLayout) return;
    switchScreen('camera');
    updateShotCounter();
    
    // Auto start camera on mobile
    if (window.innerWidth <= 767) {
        startCamera();
    }
}

function goBackToLayout() {
    stopCamera();
    resetShoot();
    closeAllMobileDrawers();
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
    if (container) {
        container.innerHTML = '';
        Object.entries(CAMERA_FILTERS).forEach(([id, filter]) => {
            const btn = document.createElement('div');
            btn.className = `filter-pill ${id === activeCameraFilter ? 'active' : ''}`;
            btn.textContent = filter.name;
            btn.onclick = () => selectCameraFilter(id);
            container.appendChild(btn);
        });
    }

    // Populate mobile filter drawer
    const mobileContainer = document.getElementById('mobileFilterDrawer');
    if (mobileContainer) {
        mobileContainer.innerHTML = '';
        Object.entries(CAMERA_FILTERS).forEach(([id, filter]) => {
            const btn = document.createElement('div');
            btn.className = `filter-pill ${id === activeCameraFilter ? 'active' : ''}`;
            btn.textContent = filter.name;
            btn.onclick = () => {
                selectCameraFilter(id);
                // Highlight active tool button if active
                const mobBtn = document.getElementById('btnMobileFilter');
                if (mobBtn) mobBtn.classList.add('active');
            };
            mobileContainer.appendChild(btn);
        });
    }
}

function selectCameraFilter(id) {
    activeCameraFilter = id;
    renderLiveFilters();
    cameraVideo.style.filter = CAMERA_FILTERS[id].css;
    
    // Update mobile filter name label inside frame
    const mobFilterLabel = document.getElementById('mobileFilterName');
    if (mobFilterLabel) {
        mobFilterLabel.textContent = CAMERA_FILTERS[id].name;
    }
    
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
    if (!autoCaptureEnabled) {
        faceAlignedSince = 0;
        isAutoCaptureWaiting = false;
    }
    // Sync mobile button
    const btnMobileAutoCapture = document.getElementById('mobileAutoBtn');
    if (btnMobileAutoCapture) btnMobileAutoCapture.classList.toggle('active', autoCaptureEnabled);
}

function toggleMirrorMode() {
    isMirrorMode = document.getElementById('mirrorToggle').checked;
    applyVideoTransform();
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
    
    // Highlight active background pill
    const boxes = document.querySelectorAll('#cameraTabBackground .filter-preview-box');
    boxes.forEach(box => {
        if (box.getAttribute('onclick') && box.getAttribute('onclick').includes(`'${bgType}'`)) {
            box.classList.add('active');
        }
    });

    if (bgType !== 'none') {
        cameraVideo.style.opacity = '0';
        document.getElementById('bgCanvas').classList.remove('hidden');
        if (!selfieSegmenter) {
            initSelfieSegmentation();
        } else if (!isSegmenting) {
            isSegmenting = true;
            segmentLoop();
        }
    } else {
        cameraVideo.style.opacity = '1';
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
        showToast("Thiết bị chưa hỗ trợ tách nền. Bạn vẫn có thể dùng filter bình thường.");
        setVirtualBackground('none');
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
    
    // 1. Draw Mask
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    
    // 2. Draw person over mask (source-in)
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    // 3. Draw background behind person (destination-over)
    ctx.globalCompositeOperation = 'destination-over';
    
    if (currentVirtualBackground === 'blur') {
        ctx.filter = 'blur(15px)';
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
    } 
    // Image backgrounds (Preloaded or Custom)
    else if (['flower', 'cafe', 'christmas', 'tet-red'].includes(currentVirtualBackground) && loadedVbgImages[currentVirtualBackground]) {
        const bgImg = loadedVbgImages[currentVirtualBackground];
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    } 
    else if (currentVirtualBackground === 'custom' && customBackgroundImage) {
        ctx.drawImage(customBackgroundImage, 0, 0, canvas.width, canvas.height);
    }
    // Gradient backgrounds
    else {
        let grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        if (currentVirtualBackground === 'studio-pink') {
            grad.addColorStop(0, '#ff9a9e');
            grad.addColorStop(1, '#fecfef');
        } else if (currentVirtualBackground === 'neon-purple') {
            grad.addColorStop(0, '#1a0030');
            grad.addColorStop(1, '#8f00ff');
        } else if (currentVirtualBackground === 'sky-blue') {
            grad.addColorStop(0, '#a1c4fd');
            grad.addColorStop(1, '#c2e9fb');
        } else if (currentVirtualBackground === 'gradient-dream') {
            grad.addColorStop(0, '#ff9a9e');
            grad.addColorStop(0.5, '#fecfef');
            grad.addColorStop(1, '#a1c4fd');
        } else {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
            return;
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.restore();
}

function triggerCustomBgUpload() {
    document.getElementById('customBgInput').click();
}

function handleCustomBgUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            customBackgroundImage = img;
            setVirtualBackground('custom');
            showToast('Đã tải lên hình nền ảo của bạn! 📸');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ================= TIMER SELECTION =================
let captureTimer = 0;
let countdownInterval = null;

function setTimer(seconds) {
    captureTimer = seconds;
    document.querySelectorAll('.timer-pill').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById(`btnTimer${seconds}`);
    if (activeBtn) activeBtn.classList.add('active');
}

function cancelCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    isCapturing = false;
    
    const pcCaptureBtn = document.getElementById('btnCapture');
    const mobileCaptureBtn = document.getElementById('mobileCaptureBtn');
    if (pcCaptureBtn) pcCaptureBtn.disabled = false;
    if (mobileCaptureBtn) mobileCaptureBtn.disabled = false;
    
    countdownEl.classList.add('hidden');
    document.getElementById('btnCancelCountdown').classList.add('hidden');
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    showToast('Đã hủy đếm ngược chụp ảnh! 🛑');
}

// ================= PHOTO UPLOAD FALLBACK =================
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
    
    if (isMirrorMode) {
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
        
        if (autoCaptureEnabled && !isCapturing && !isAutoCaptureWaiting && capturedImages.length < 6) {
            if (faceAlignedSince === 0) {
                faceAlignedSince = Date.now();
            } else if (Date.now() - faceAlignedSince > 1500) {
                isAutoCaptureWaiting = true;
                faceAlignedSince = 0;
                startCountdown();
            }
        }
    } else {
        oval.classList.remove('aligned');
        hint.classList.remove('aligned');
        faceAlignedSince = 0;
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
        
        currentZoom = 1;
        document.getElementById('zoomSlider').value = 1;
        document.getElementById('zoomLabel').textContent = '1.0x';
        applyVideoTransform();
        document.getElementById('zoomContainer').classList.remove('hidden');
        
        cameraVideo.onloadedmetadata = () => {
            document.querySelector('.camera-loading').classList.add('hidden');
            document.getElementById('btnStartCamera').classList.add('hidden');
            document.getElementById('btnCapture').classList.remove('hidden');
            btnCapture.disabled = false;
            
            // Enable mobile capture button
            const mobCaptureBtn = document.getElementById('mobileCaptureBtn');
            if (mobCaptureBtn) {
                mobCaptureBtn.disabled = false;
                mobCaptureBtn.classList.remove('hidden');
            }
            
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
    const bgCanvas = document.getElementById('bgCanvas');

    // Đặt lại kích thước gốc 100% cho element
    cameraVideo.style.width = '100%';
    cameraVideo.style.height = '100%';
    
    // Nếu zoom < 1 (muốn góc rộng): dùng contain để thấy toàn bộ chiều ngang video
    // Nếu zoom >= 1 (muốn zoom cận): dùng cover và scale lên
    if (currentZoom < 1) {
        cameraVideo.style.objectFit = 'contain';
    } else {
        cameraVideo.style.objectFit = 'cover';
    }

    cameraVideo.style.position = 'absolute';
    cameraVideo.style.left = '50%';
    cameraVideo.style.top = '50%';

    // Với zoom < 1, do dùng contain đã lấy được góc rộng nhất, ta giữ scale = 1 
    // để ảnh ko bị thu nhỏ thêm tạo viền đen 4 phía.
    const actualScale = currentZoom < 1 ? 1 : currentZoom;
    const scaleX = isMirrorMode ? -actualScale : actualScale;

    cameraVideo.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${actualScale})`;

    if (bgCanvas) {
        bgCanvas.style.width = '100%';
        bgCanvas.style.height = '100%';
        bgCanvas.style.objectFit = currentZoom < 1 ? 'contain' : 'cover';
        bgCanvas.style.position = 'absolute';
        bgCanvas.style.left = '50%';
        bgCanvas.style.top = '50%';
        bgCanvas.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${actualScale})`;
    }

    if (isMirrorMode) {
        cameraVideo.classList.add('mirror');
        if (bgCanvas) bgCanvas.classList.add('mirror');
    } else {
        cameraVideo.classList.remove('mirror');
        if (bgCanvas) bgCanvas.classList.remove('mirror');
    }
}

function switchCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    applyVideoTransform();
    startCamera();
}

function updateShotCounter() {
    shotCounter.textContent = `Đã chụp ${capturedImages.length}/6`;
    
    thumbnailsContainer.innerHTML = '';
    capturedImages.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'thumb-item';
        thumbnailsContainer.appendChild(img);
    });

    // Mobile specific sync
    const mobileShotCount = document.getElementById('mobileShotCount');
    const mobileTotalShot = document.getElementById('mobileTotalShot');
    const mobileThumbnailStrip = document.getElementById('mobileThumbnailStrip');
    
    if (mobileShotCount && mobileTotalShot && mobileThumbnailStrip) {
        mobileShotCount.textContent = capturedImages.length;
        mobileTotalShot.textContent = 6;
        
        mobileThumbnailStrip.innerHTML = '';
        capturedImages.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            img.className = 'thumb-item';
            mobileThumbnailStrip.appendChild(img);
        });
    }
}

function speakVietnamese(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(voice => voice.lang.includes('vi'));
        if (viVoice) {
            utterance.voice = viVoice;
        }
        
        utterance.rate = 1.3;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

function startCountdown() {
    if (isCapturing) return;
    isCapturing = true;
    
    const pcCaptureBtn = document.getElementById('btnCapture');
    const mobileCaptureBtn = document.getElementById('mobileCaptureBtn');
    if (pcCaptureBtn) pcCaptureBtn.disabled = true;
    if (mobileCaptureBtn) mobileCaptureBtn.disabled = true;
    
    const selectedTimer = captureTimer;
    
    if (selectedTimer === 0) {
        capturePhoto();
        return;
    }
    
    let counter = selectedTimer;
    countdownEl.textContent = counter;
    countdownEl.classList.remove('hidden');
    countdownEl.classList.add('pop');
    document.getElementById('btnCancelCountdown').classList.remove('hidden');
    
    // Play countdown beep
    if (beepAudio.readyState >= 2) {
        beepAudio.currentTime = 0;
        beepAudio.play().catch(e => console.log(e));
    }
    speakVietnamese(counter.toString());
    
    countdownInterval = setInterval(() => {
        counter--;
        
        if (counter > 0) {
            countdownEl.textContent = counter;
            countdownEl.classList.remove('pop');
            void countdownEl.offsetWidth; // trigger reflow
            countdownEl.classList.add('pop');
            
            // Beep and speak
            if (beepAudio.readyState >= 2) {
                beepAudio.currentTime = 0;
                beepAudio.play().catch(e => console.log(e));
            }
            speakVietnamese(counter.toString());
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            countdownEl.classList.add('hidden');
            document.getElementById('btnCancelCountdown').classList.add('hidden');
            capturePhoto();
        }
    }, 1000);
}

function drawVideoCoverToCanvas(video, canvas, isMirror = false) {
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
    
    // Beauty smoothing filter using blur composite hack
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
    
    // Draw filter overlays
    if (filterObj.overlay && filterObj.overlay !== 'transparent') {
        ctx.fillStyle = filterObj.overlay;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.restore();
}

function capturePhoto() {
    // Shutter flash animation
    flashEl.classList.add('active');
    setTimeout(() => flashEl.classList.remove('active'), 300);
    
    // Play shutter sound
    if(shutterAudio.readyState >= 2) {
        shutterAudio.currentTime = 0;
        shutterAudio.play().catch(e => console.log(e));
    }
    
    captureCanvas.width = 900;
    captureCanvas.height = 1200;
    
    const shouldMirror = isMirrorMode;
    const sourceElement = currentVirtualBackground !== 'none' ? document.getElementById('bgCanvas') : cameraVideo;
    drawVideoCoverToCanvas(sourceElement, captureCanvas, shouldMirror);
    
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
        isAutoCaptureWaiting = false;
        
        const pcCaptureBtn = document.getElementById('btnCapture');
        const mobileCaptureBtn = document.getElementById('mobileCaptureBtn');
        if (pcCaptureBtn) pcCaptureBtn.disabled = false;
        if (mobileCaptureBtn) mobileCaptureBtn.disabled = false;
        
        // Reset face alignment timer so auto capture requires re-alignment
        faceAlignedSince = 0;
    }
}

function resetShoot() {
    capturedImages = [];
    selectedImages = [];
    selectedSelectionIndices = [];
    isCapturing = false;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    autoCaptureEnabled = false;
    isAutoCaptureWaiting = false;
    faceAlignedSince = 0;
    const autoToggle = document.getElementById('autoCaptureToggle');
    if (autoToggle) autoToggle.checked = false;
    const btnMobileAutoCapture = document.getElementById('mobileAutoBtn');
    if (btnMobileAutoCapture) btnMobileAutoCapture.classList.remove('active');
    
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
        selectedSelectionIndices.splice(selIndex, 1);
    } else {
        if (selectedSelectionIndices.length < maxImages) {
            selectedSelectionIndices.push(index);
        } else {
            selectedSelectionIndices.shift();
            selectedSelectionIndices.push(index);
        }
    }
    
    const subtitle = document.getElementById('selectionSubtitle');
    subtitle.textContent = `Chọn ${selectedSelectionIndices.length}/${maxImages} bức ảnh bạn thích nhất ✨`;
    
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
    
    selectedImages = selectedSelectionIndices.map(idx => capturedImages[idx]);
    goToEditor();
}

// ================= EDITOR SCREEN =================
function goToEditor() {
    switchScreen('editor');
    renderPhotobooth();
    
    // Re-setup pointer events after entering editor (in case DOM changed)
    requestAnimationFrame(() => {
        setupInteractiveLayer();
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    
    const activeTabBtn = document.getElementById(`btnTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
    if (activeTabBtn) activeTabBtn.classList.add('active');
    
    const tabEl = document.getElementById(`tab-${tabId}`);
    if (tabEl) tabEl.style.display = 'block';
}

function renderStickers() {
    const list = document.getElementById('stickerList');
    if (!list) return;
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
        rotation: 0,
        opacity: 1
    };
    draggableElements.push(el);
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
}

// ================= UPGRADED TEXT EDITOR ACTIONS =================
function addCustomText() {
    const input = document.getElementById('textInput');
    const content = input.value.trim();
    if (!content) return;
    
    const font = document.getElementById('fontSelect').value;
    const color = document.getElementById('textColor').value;
    const size = parseInt(document.getElementById('textSize').value) || 36;
    const strokeWidth = parseInt(document.getElementById('textStroke').value) || 0;
    const strokeColor = document.getElementById('strokeColor').value;
    const shadowBlur = parseInt(document.getElementById('textShadow').value) || 0;
    const shadowColor = document.getElementById('shadowColor').value;
    const opacity = parseFloat(document.getElementById('textOpacity').value) / 100 || 1.0;
    const rotation = parseInt(document.getElementById('textRotation').value) || 0;
    
    const weight = document.getElementById('toggleBold').classList.contains('active') ? '700' : '400';
    const italic = document.getElementById('toggleItalic').classList.contains('active');
    
    let align = 'center';
    if (document.getElementById('btnAlignLeft').classList.contains('active')) align = 'left';
    else if (document.getElementById('btnAlignRight').classList.contains('active')) align = 'right';

    const el = {
        type: 'text',
        content: content,
        x: interactiveLayer.offsetWidth / 2,
        y: interactiveLayer.offsetHeight / 2,
        fontSize: size,
        font: font,
        color: color,
        weight: weight,
        italic: italic,
        align: align,
        rotation: rotation,
        opacity: opacity,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
        shadowColor: shadowColor,
        shadowBlur: shadowBlur
    };
    
    draggableElements.push(el);
    input.value = '';
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
    showToast('Đã thêm chữ thành công! ✍️');
}

function handleTextInputChange(val) {
    if (selectedElementIndex > -1 && draggableElements[selectedElementIndex].type === 'text') {
        updateSelectedTextProperty('content', val);
    }
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
    } else {
        document.getElementById('toggleBold').classList.toggle('active');
    }
}

function toggleTextItalic() {
    if (selectedElementIndex > -1 && draggableElements[selectedElementIndex].type === 'text') {
        const el = draggableElements[selectedElementIndex];
        el.italic = !el.italic;
        document.getElementById('toggleItalic').classList.toggle('active', el.italic);
        renderInteractiveElements();
    } else {
        document.getElementById('toggleItalic').classList.toggle('active');
    }
}

function setTextAlign(align) {
    updateSelectedTextProperty('align', align);
    
    document.querySelectorAll('.align-pill').forEach(pill => pill.classList.remove('active'));
    if (align === 'left') document.getElementById('btnAlignLeft').classList.add('active');
    else if (align === 'center') document.getElementById('btnAlignCenter').classList.add('active');
    else if (align === 'right') document.getElementById('btnAlignRight').classList.add('active');
}

function updateSelectedTextProperty(prop, value) {
    if (selectedElementIndex > -1) {
        const el = draggableElements[selectedElementIndex];
        el[prop] = value;
        renderInteractiveElements();
    }
}

// Preset Quick Text suggestions with unique beautiful styling presets
const QUICK_TEXT_PRESETS = {
    'Best Day Ever': { font: 'Pacifico', color: '#ff5fb7', size: 48, shadowBlur: 6, shadowColor: '#000000', weight: '400', align: 'center' },
    'Lovely Moments': { font: 'Playfair Display', color: '#ffffff', size: 42, shadowBlur: 8, shadowColor: '#ff5fb7', weight: '700', italic: true, align: 'center' },
    'Photobooth Pro': { font: 'Bebas Neue', color: '#b56cff', size: 52, strokeWidth: 2, strokeColor: '#000000', weight: '700', align: 'center' },
    'Cao Bá Thiên': { font: 'Syne', color: '#ffd700', size: 45, shadowBlur: 10, shadowColor: '#b56cff', weight: '800', align: 'center' },
    'My Favorite Day': { font: 'Space Grotesk', color: '#aaffc3', size: 38, weight: '700', align: 'center' },
    'Made with love': { font: 'Pacifico', color: '#ff3366', size: 40, weight: '400', align: 'center' },
    'Happy Time': { font: 'DM Sans', color: '#ffffff', size: 36, shadowBlur: 5, shadowColor: '#000000', weight: '700', align: 'center' },
    'Cute Moment': { font: 'Playfair Display', color: '#ff9a9e', size: 44, weight: '700', italic: true, align: 'center' },
    'Love Yourself': { font: 'Syne', color: '#b56cff', size: 38, weight: '700', align: 'center' },
    '2026 Memories': { font: 'Space Grotesk', color: '#ffffff', size: 36, strokeWidth: 1.5, strokeColor: '#ff5fb7', weight: '800', align: 'center' }
};

function quickAddText(textStr) {
    const preset = QUICK_TEXT_PRESETS[textStr] || { font: 'Pacifico', color: '#ff5fb7', size: 36, weight: '400', align: 'center' };
    
    const el = {
        type: 'text',
        content: textStr,
        x: interactiveLayer.offsetWidth / 2,
        y: interactiveLayer.offsetHeight * 0.82, // position near bottom
        fontSize: preset.size,
        font: preset.font,
        color: preset.color,
        weight: preset.weight,
        italic: preset.italic || false,
        align: preset.align,
        rotation: 0,
        opacity: 1,
        strokeColor: preset.strokeColor || '#000000',
        strokeWidth: preset.strokeWidth || 0,
        shadowColor: preset.shadowColor || '#000000',
        shadowBlur: preset.shadowBlur || 0
    };
    
    draggableElements.push(el);
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
    showToast(`Đã thêm gợi ý: "${textStr}"! 🌟`);
}

function setFrameBg(bg) {
    frameBg = bg;
    renderPhotobooth();
}

function applyFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    
    const activeFilterBtn = document.querySelector(`.filter-btn[onclick="applyFilter('${filter}')"]`);
    if (activeFilterBtn) activeFilterBtn.classList.add('active');
    
    updateCanvasCSS();
}

function setOverlay(overlay) {
    currentOverlay = overlay;
    document.querySelectorAll('.effect-btn').forEach(btn => btn.classList.remove('active'));
    
    const activeOverlayBtn = document.querySelector(`.effect-btn[onclick="setOverlay('${overlay}')"]`);
    if (activeOverlayBtn) activeOverlayBtn.classList.add('active');
    
    renderPhotobooth();
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

// ================= COMPREHENSIVE CANVAS THEME RENDERING =================
async function renderPhotobooth() {
    const ctx = finalCanvas.getContext('2d');
    
    let width, height;
    let imgRects = [];
    
    const padding = 40;
    const spacing = 30;
    const imgWidth = 600;
    const imgHeight = 400;

    // 1. Polaroid structure (1 photo)
    if (selectedLayout === 'polaroid') {
        width = 700;
        height = 880;
        imgRects = [{ x: 50, y: 50, w: 600, h: 600 }];
    } 
    // 2. Full Magazine Cover structure (1 photo occupies whole canvas)
    else if (selectedLayout === 'magazine') {
        width = 700;
        height = 950;
        imgRects = [{ x: 0, y: 0, w: 700, h: 950 }];
    }
    // 3. 2 Photos vertically
    else if (selectedLayout === '2-strip') {
        width = imgWidth + padding * 2;
        height = (imgHeight * 2) + spacing + padding * 3;
        imgRects = [
            { x: padding, y: padding, w: imgWidth, h: imgHeight },
            { x: padding, y: padding + imgHeight + spacing, w: imgWidth, h: imgHeight }
        ];
    } 
    // 4. 3 Photos vertically (Minimal White / Trung Thu)
    else if (selectedLayout === '3-strip') {
        width = imgWidth + padding * 2;
        height = (imgHeight * 3) + (spacing * 2) + padding * 3;
        imgRects = [
            { x: padding, y: padding, w: imgWidth, h: imgHeight },
            { x: padding, y: padding + imgHeight + spacing, w: imgWidth, h: imgHeight },
            { x: padding, y: padding + (imgHeight + spacing) * 2, w: imgWidth, h: imgHeight }
        ];
    }
    // 5. 4 Photos vertically
    else if (selectedLayout === '4-strip') {
        width = imgWidth + padding * 2;
        height = (imgHeight * 4) + (spacing * 3) + padding * 3;
        for (let i = 0; i < 4; i++) {
            imgRects.push({ x: padding, y: padding + i * (imgHeight + spacing), w: imgWidth, h: imgHeight });
        }
    } 
    // 6. 2x2 Grid (4 photos)
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
    
    // Scale editor layer
    interactiveLayer.style.width = width + 'px';
    interactiveLayer.style.height = height + 'px';
    
    const wrapper = document.getElementById('canvasWrapper');
    const scale = Math.min(
        (wrapper.clientWidth - 40) / width, 
        (wrapper.clientHeight - 40) / height
    );
    
    finalCanvas.style.width = `${width * scale}px`;
    finalCanvas.style.height = `${height * scale}px`;
    interactiveLayer.style.transform = `translate(-50%, -50%) scale(${scale})`;
    
    // 1. Draw Background Frame
    const bgToUse = selectedTheme ? selectedTheme.bg : frameBg;
    
    if (bgToUse.startsWith('linear-gradient')) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
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

    // 1b. Render decorative overlays behind images
    if (currentOverlay !== 'none') {
        drawOverlay(ctx, width, height, currentOverlay);
    }
    
    if (selectedTheme && selectedTheme.decos && selectedTheme.id !== 'magazine-cover') {
        drawThemedDecorations(ctx, width, height, selectedTheme.decos);
    }

    // 2. Draw Photos with clean scaling and round borders
    for (let i = 0; i < maxImages; i++) {
        if (!selectedImages[i]) continue;
        
        const rect = imgRects[i];
        const img = new Image();
        img.src = selectedImages[i];
        await new Promise(r => img.onload = r);
        
        // Border rendering
        if (selectedTheme && selectedTheme.borderColor && selectedTheme.id !== 'magazine-cover') {
            ctx.save();
            ctx.strokeStyle = selectedTheme.borderColor;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4, selectedLayout === 'polaroid' ? 6 : 14);
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.save();
        ctx.beginPath();
        // Magazine cover photo doesn't have borders
        if (selectedTheme && selectedTheme.id === 'magazine-cover') {
            ctx.rect(rect.x, rect.y, rect.w, rect.h);
        } else {
            ctx.roundRect(rect.x, rect.y, rect.w, rect.h, selectedLayout === 'polaroid' ? 4 : 12);
        }
        ctx.clip();
        
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
    
    // 3. Draw Brand Branding & Date stamp
    let brandingText = selectedTheme ? selectedTheme.textDefault : 'Photobooth Pro';
    let textColor = selectedTheme ? (selectedTheme.borderColor || '#fff') : getTextColorForBg(bgToUse);
    
    ctx.save();
    ctx.textAlign = 'center';
    
    if (selectedTheme && selectedTheme.id === 'magazine-cover') {
        // Outstanding VOGUE style brand text overlaid on top of image
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 82px "Playfair Display", serif';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        ctx.fillText(brandingText, width / 2, 130);
    } else {
        ctx.fillStyle = textColor;
        ctx.font = 'bold 30px "Syne", sans-serif';
        ctx.fillText(brandingText, width / 2, height - padding / 1.5);
        
        if (showDateStamp) {
            const date = new Date();
            const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
            ctx.font = '500 20px "Space Grotesk", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(dateStr, width - padding, height - padding / 1.5);
        }
    }
    ctx.restore();
    
    // 3b. Foreground premium theme decorations
    if (selectedTheme && selectedTheme.decos && selectedTheme.id !== 'magazine-cover') {
        drawThemedDecorationsTop(ctx, width, height, selectedTheme.decos);
    }
}

function getTextColorForBg(bg) {
    if (bg === '#ffffff' || bg === '#ffd1dc' || bg === '#aaffc3' || bg === '#fffacd') return '#000000';
    return '#ffffff';
}

function drawThemedDecorations(ctx, w, h, decos) {
    ctx.save();
    let seed = 42;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    
    for (let i = 0; i < 22; i++) {
        const emoji = decos[Math.floor(rng() * decos.length)];
        ctx.save();
        ctx.globalAlpha = 0.12 + rng() * 0.15;
        ctx.translate(rng() * w, rng() * h);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.font = `${22 + rng() * 28}px sans-serif`;
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
    }
    ctx.restore();
}

function drawThemedDecorationsTop(ctx, w, h, decos) {
    ctx.save();
    const size = 28;
    ctx.font = `${size}px sans-serif`;
    ctx.globalAlpha = 0.85;
    
    // Top corners
    decos.slice(0, 3).forEach((emoji, i) => {
        ctx.fillText(emoji, 15 + i * 32, 35);
        ctx.fillText(emoji, w - 45 - i * 32, 35);
    });
    
    // Bottom corners
    ctx.fillText(decos[0], 15, h - 55);
    if (decos[1]) ctx.fillText(decos[1], 48, h - 55);
    ctx.fillText(decos[decos.length - 1], w - 45, h - 55);
    
    ctx.restore();
}

function drawOverlay(ctx, w, h, type) {
    ctx.save();
    
    if (type === 'sparkle') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for(let i=0; i<60; i++) {
            ctx.beginPath();
            ctx.arc(Math.random()*w, Math.random()*h, Math.random()*3.5, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (type === 'grain') {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for(let i=0; i<w; i+=4) {
            for(let j=0; j<h; j+=4) {
                if(Math.random() > 0.48) ctx.fillRect(i, j, 2, 2);
            }
        }
    } else if (['hearts', 'stars', 'flowers', 'butterflies', 'music'].includes(type)) {
        let char = '❤️';
        if (type === 'stars') char = '⭐';
        if (type === 'flowers') char = '🌸';
        if (type === 'butterflies') char = '🦋';
        if (type === 'music') char = '🎵';
        
        for(let i=0; i<35; i++) {
            ctx.save();
            ctx.translate(Math.random()*w, Math.random()*h);
            ctx.rotate(Math.random() * Math.PI * 2);
            const size = 18 + Math.random() * 22;
            ctx.font = `${size}px Arial`;
            ctx.fillText(char, 0, 0);
            ctx.restore();
        }
    } else if (type === 'bubbles') {
        for(let i=0; i<45; i++) {
            const bx = Math.random()*w;
            const by = Math.random()*h;
            const br = 12 + Math.random()*20;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI*2);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 1.8;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(bx - br*0.3, by - br*0.3, br*0.15, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fill();
        }
    }
    
    ctx.restore();
}

// ================= DRAG & DROP ELEMENTS =================
let dragOffsetX = 0;
let dragOffsetY = 0;

function getElementAtPosition(x, y) {
  const ctx = finalCanvas.getContext("2d");
  const isMobile = window.innerWidth <= 767;

  for (let i = draggableElements.length - 1; i >= 0; i--) {
    const el = draggableElements[i];
    const extraHit = isMobile ? 45 : 18;

    if (el.type === "sticker") {
      const size = el.fontSize || 64;
      const hitSize = size + extraHit * 2;

      if (
        x >= el.x - hitSize / 2 &&
        x <= el.x + hitSize / 2 &&
        y >= el.y - hitSize / 2 &&
        y <= el.y + hitSize / 2
      ) {
        return i;
      }
    }

    if (el.type === "text") {
      const size = el.fontSize || 48;
      const font = el.font || "Arial";
      const weight = el.weight || "700";
      const italic = el.italic ? "italic " : "";

      ctx.save();
      ctx.font = `${italic}${weight} ${size}px "${font}", sans-serif`;
      const metrics = ctx.measureText(el.content || "");
      ctx.restore();

      const textWidth = metrics.width;
      const textHeight = size;

      let alignOffset = 0;
      if (el.align === 'left') alignOffset = textWidth / 2;
      if (el.align === 'right') alignOffset = -textWidth / 2;
      
      const boxLeft = el.x - textWidth / 2 + alignOffset;
      const boxRight = el.x + textWidth / 2 + alignOffset;
      const boxTop = el.y - textHeight / 2;
      const boxBottom = el.y + textHeight / 2;

      if (
        x >= boxLeft - extraHit &&
        x <= boxRight + extraHit &&
        y >= boxTop - extraHit &&
        y <= boxBottom + extraHit
      ) {
        return i;
      }
    }
  }

  return -1;
}

let activePointerId = null;
let savedScrollY = 0;

function setupInteractiveLayer() {
    // Remove old listeners first to prevent duplicates
    interactiveLayer.removeEventListener('pointerdown', handleDragStart);
    interactiveLayer.removeEventListener('pointermove', handleDragMove);
    interactiveLayer.removeEventListener('pointerup', handleDragEnd);
    interactiveLayer.removeEventListener('pointercancel', handleDragEnd);
    interactiveLayer.removeEventListener('lostpointercapture', handleDragEnd);
    
    interactiveLayer.addEventListener('pointerdown', handleDragStart, { passive: false });
    interactiveLayer.addEventListener('pointermove', handleDragMove, { passive: false });
    interactiveLayer.addEventListener('pointerup', handleDragEnd, { passive: false });
    interactiveLayer.addEventListener('pointercancel', handleDragEnd, { passive: false });
    interactiveLayer.addEventListener('lostpointercapture', handleDragEnd, { passive: false });
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
        
        // Remove pointer events from the visible div since canvas hit detection handles interaction
        div.style.pointerEvents = 'none';
        
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
            div.style.textAlign = el.align || 'center';
            
            if (el.strokeWidth > 0) {
                div.style.webkitTextStroke = `${el.strokeWidth}px ${el.strokeColor || '#000'}`;
            }
            if (el.shadowBlur > 0) {
                div.style.textShadow = `0 0 ${el.shadowBlur}px ${el.shadowColor || '#000'}`;
            }
            div.textContent = el.content;
        }
        
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        // Keep pointer events for the resize handle
        handle.style.pointerEvents = 'auto';
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

function syncAllElementControls() {
    const el = draggableElements[selectedElementIndex];
    const panel = document.getElementById('selectedElementPanel');
    if (!el) {
        if(panel) panel.classList.add('hidden');
        return;
    }
    
    if(panel) {
        panel.classList.remove('hidden');
        document.getElementById('selectedElementType').textContent = el.type === 'text' ? 'Chữ' : (el.type === 'sticker' ? 'Sticker' : 'Ảnh');
        
        if (el.type === 'text') {
            document.getElementById('textOnlyControls').classList.remove('hidden');
        } else {
            document.getElementById('textOnlyControls').classList.add('hidden');
        }
    }

    const size = el.fontSize || 80;
    document.querySelectorAll(".js-element-size-range").forEach(input => {
        input.value = size;
    });
    document.querySelectorAll(".js-element-size-value").forEach(label => {
        label.textContent = size;
    });

    const rotation = el.rotation || 0;
    document.querySelectorAll(".js-element-rotate-range").forEach(input => {
        input.value = rotation;
    });
    document.querySelectorAll(".js-element-rotate-value").forEach(label => {
        label.textContent = rotation;
    });

    const opacity = el.opacity ?? 1;
    document.querySelectorAll(".js-element-opacity-range").forEach(input => {
        input.value = opacity;
    });
    document.querySelectorAll(".js-element-opacity-value").forEach(label => {
        label.textContent = Math.round(opacity * 100);
    });
    
    if (el.type === 'text') {
        const color = el.color || '#ffffff';
        document.querySelectorAll(".js-text-color-input").forEach(input => {
            input.value = color;
        });
        
        const font = el.font || 'Arial';
        document.querySelectorAll(".js-font-select").forEach(select => {
            select.value = font;
        });
    }
}

function updateSelectedElementSize(size) {
    if (selectedElementIndex === -1) return;
    draggableElements[selectedElementIndex].fontSize = Number(size);
    
    // Also update legacy PC controls if text
    if (draggableElements[selectedElementIndex].type === 'text') {
        const legacySize = document.getElementById('textSize');
        if (legacySize) legacySize.value = size;
        const legacyVal = document.getElementById('fontSizeVal');
        if (legacyVal) legacyVal.textContent = size;
    }
    
    requestRender();
}

function updateSelectedElementRotation(rotation) {
    if (selectedElementIndex === -1) return;
    draggableElements[selectedElementIndex].rotation = Number(rotation);
    
    if (draggableElements[selectedElementIndex].type === 'text') {
        const legacyRot = document.getElementById('textRotation');
        if (legacyRot) legacyRot.value = rotation;
        const legacyVal = document.getElementById('rotationVal');
        if (legacyVal) legacyVal.textContent = rotation;
    }
    
    requestRender();
}

function updateSelectedElementOpacity(opacity) {
    if (selectedElementIndex === -1) return;
    draggableElements[selectedElementIndex].opacity = Number(opacity);
    
    if (draggableElements[selectedElementIndex].type === 'text') {
        const legacyOp = document.getElementById('textOpacity');
        if (legacyOp) legacyOp.value = Math.round(Number(opacity) * 100);
        const legacyVal = document.getElementById('opacityVal');
        if (legacyVal) legacyVal.textContent = Math.round(Number(opacity) * 100);
    }
    
    requestRender();
}

function updateSelectedTextColor(color) {
    if (selectedElementIndex === -1) return;
    if (draggableElements[selectedElementIndex].type !== 'text') return;
    draggableElements[selectedElementIndex].color = color;
    
    const legacyCol = document.getElementById('textColor');
    if (legacyCol) legacyCol.value = color;
    
    requestRender();
}

function updateSelectedTextFont(font) {
    if (selectedElementIndex === -1) return;
    if (draggableElements[selectedElementIndex].type !== 'text') return;
    draggableElements[selectedElementIndex].font = font;
    
    const legacyFont = document.getElementById('fontSelect');
    if (legacyFont) legacyFont.value = font;
    
    requestRender();
}

// Bind events to the new unified inputs
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(".js-element-size-range").forEach(range => {
        range.addEventListener("input", event => {
            updateSelectedElementSize(event.target.value);
            syncAllElementControls();
        });
    });

    document.querySelectorAll(".js-element-rotate-range").forEach(range => {
        range.addEventListener("input", event => {
            updateSelectedElementRotation(event.target.value);
            syncAllElementControls();
        });
    });

    document.querySelectorAll(".js-element-opacity-range").forEach(range => {
        range.addEventListener("input", event => {
            updateSelectedElementOpacity(event.target.value);
            syncAllElementControls();
        });
    });
    
    document.querySelectorAll(".js-text-color-input").forEach(input => {
        input.addEventListener("input", event => {
            updateSelectedTextColor(event.target.value);
            syncAllElementControls();
        });
    });
    
    document.querySelectorAll(".js-font-select").forEach(select => {
        select.addEventListener("change", event => {
            updateSelectedTextFont(event.target.value);
            syncAllElementControls();
        });
    });
});

function selectElement(index) {
    selectedElementIndex = index;
    renderInteractiveElements();
    syncAllElementControls();
    
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
        
        const align = el.align || 'center';
        document.querySelectorAll('.align-pill').forEach(pill => pill.classList.remove('active'));
        if (align === 'left') document.getElementById('btnAlignLeft').classList.add('active');
        else if (align === 'center') document.getElementById('btnAlignCenter').classList.add('active');
        else if (align === 'right') document.getElementById('btnAlignRight').classList.add('active');
        
        switchTab('text');
    } else if (index > -1 && draggableElements[index].type === 'sticker') {
        switchTab('stickers');
    }
}

function deleteSelectedElement() {
    if (selectedElementIndex > -1) {
        draggableElements.splice(selectedElementIndex, 1);
        selectedElementIndex = -1;
        renderInteractiveElements();
        showToast('Đã xóa chữ thành công! 🗑️');
    }
}

function centerSelectedElement() {
    if (selectedElementIndex === -1) return;
    const el = draggableElements[selectedElementIndex];
    el.x = interactiveLayer.offsetWidth / 2;
    el.y = interactiveLayer.offsetHeight / 2;
    renderInteractiveElements();
}

function handleDragStart(e) {
    // Ignore touch events here — handled by dedicated touch handlers
    if (e.pointerType === 'touch') return;
    
    const target = e.target;
    
    if (target.classList.contains('resize-handle')) {
        e.preventDefault();
        e.stopPropagation();
        actionType = 'resize';
        const elDiv = target.closest('.draggable-element');
        selectedElementIndex = parseInt(elDiv.dataset.index);
        
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        activePointerId = e.pointerId;
        
        try { interactiveLayer.setPointerCapture(e.pointerId); } catch(err) {}
        
        selectElement(selectedElementIndex);
        return;
    }
    
    const rect = interactiveLayer.getBoundingClientRect();
    const scaleX = interactiveLayer.offsetWidth / rect.width;
    const scaleY = interactiveLayer.offsetHeight / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const elementIndex = getElementAtPosition(x, y);
    
    if (elementIndex !== -1) {
        e.preventDefault();
        e.stopPropagation();
        actionType = 'drag';
        selectedElementIndex = elementIndex;
        isDragging = true;
        activePointerId = e.pointerId;
        
        const el = draggableElements[selectedElementIndex];
        dragOffsetX = x - el.x;
        dragOffsetY = y - el.y;
        
        try { interactiveLayer.setPointerCapture(e.pointerId); } catch (err) {}
        
        savedScrollY = window.scrollY;
        document.body.classList.add("dragging-canvas");
        document.body.style.top = `-${savedScrollY}px`;
        finalCanvas.classList.add("dragging");
        interactiveLayer.classList.add("dragging");
        
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        selectElement(selectedElementIndex);
    } else {
        selectElement(-1);
    }
}

let needsRender = false;
function requestRender() {
    if (needsRender) return;
    needsRender = true;
    requestAnimationFrame(() => {
        renderInteractiveElements();
        needsRender = false;
    });
}

function handleDragMove(e) {
    if (e.pointerType === 'touch') return; // handled by touch handlers
    if (selectedElementIndex === -1 || !actionType) return;
    if (activePointerId !== null && activePointerId !== e.pointerId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const el = draggableElements[selectedElementIndex];
    const rect = interactiveLayer.getBoundingClientRect();
    
    if (actionType === 'drag') {
        const scaleX = interactiveLayer.offsetWidth / rect.width;
        const scaleY = interactiveLayer.offsetHeight / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        el.x = x - dragOffsetX;
        el.y = y - dragOffsetY;
        
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    } else if (actionType === 'resize') {
        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;
        const scale = interactiveLayer.getBoundingClientRect().width / finalCanvas.width;
        
        const sign = (deltaX > 0 || deltaY > 0) ? 1 : (deltaX < 0 && deltaY < 0 ? -1 : (deltaX - deltaY > 0 ? 1 : -1));
        const dist = Math.sqrt(deltaX*deltaX + deltaY*deltaY);
        el.fontSize = Math.max(10, el.fontSize + (dist/scale) * sign * 0.5);
        
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    }
    
    requestRender();
}

function handleDragEnd(e) {
    if (e.pointerType === 'touch') return; // handled by touch handlers
    if (isDragging || actionType) {
        e.preventDefault();
        e.stopPropagation();
        try {
            if (activePointerId !== null) interactiveLayer.releasePointerCapture(activePointerId);
        } catch (err) {}
        
        document.body.classList.remove("dragging-canvas");
        document.body.style.top = '';
        window.scrollTo(0, savedScrollY);
        
        finalCanvas.classList.remove("dragging");
        interactiveLayer.classList.remove("dragging");
    }
    
    isDragging = false;
    actionType = null;
    activePointerId = null;
}

// ================= TOUCH EVENTS FOR MOBILE DRAG =================
// Dedicated touch handlers that run ALWAYS on mobile
function setupTouchFallback() {
    // interactiveLayer phủ lên canvas, mọi touch sẽ đến đây trước
    interactiveLayer.addEventListener('touchstart', handleTouchStart, { passive: false });
    interactiveLayer.addEventListener('touchmove', handleTouchMove, { passive: false });
    interactiveLayer.addEventListener('touchend', handleTouchEnd, { passive: false });
    interactiveLayer.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

function getTouchLayerPos(touch) {
    const rect = interactiveLayer.getBoundingClientRect();
    const scaleX = interactiveLayer.offsetWidth / rect.width;
    const scaleY = interactiveLayer.offsetHeight / rect.height;
    return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
    };
}

function handleTouchStart(e) {
    // Chỉ xử lý single touch cho drag
    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const pos = getTouchLayerPos(touch);
    
    const elementIndex = getElementAtPosition(pos.x, pos.y);
    
    if (elementIndex !== -1) {
        e.preventDefault();
        e.stopPropagation();
        
        actionType = 'drag';
        selectedElementIndex = elementIndex;
        isDragging = true;
        
        const el = draggableElements[selectedElementIndex];
        dragOffsetX = pos.x - el.x;
        dragOffsetY = pos.y - el.y;
        
        savedScrollY = window.scrollY;
        document.body.classList.add('dragging-canvas');
        document.body.style.top = `-${savedScrollY}px`;
        finalCanvas.classList.add('dragging');
        interactiveLayer.classList.add('dragging');
        
        selectElement(selectedElementIndex);
    } else {
        // Chạm vào vùng trống => bỏ chọn
        selectElement(-1);
    }
}

function handleTouchMove(e) {
    if (!isDragging || selectedElementIndex === -1 || actionType !== 'drag') return;
    if (e.touches.length !== 1) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const touch = e.touches[0];
    const pos = getTouchLayerPos(touch);
    
    const el = draggableElements[selectedElementIndex];
    el.x = pos.x - dragOffsetX;
    el.y = pos.y - dragOffsetY;
    
    requestRender();
}

function handleTouchEnd(e) {
    if (!isDragging && !actionType) return;
    
    e.preventDefault();
    
    document.body.classList.remove('dragging-canvas');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
    finalCanvas.classList.remove('dragging');
    interactiveLayer.classList.remove('dragging');
    
    isDragging = false;
    actionType = null;
}

// ================= HIGH RES EXPORT =================
function downloadImage() {
    selectElement(-1); 
    
    const dlCanvas = document.createElement('canvas');
    dlCanvas.width = finalCanvas.width;
    dlCanvas.height = finalCanvas.height;
    const ctx = dlCanvas.getContext('2d');
    
    // Apply composite image adjustment filter
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
    
    // Draw Draggable text and stickers onto compiled high-res canvas
    // Clip to canvas bounds so elements dragged outside are cropped
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, dlCanvas.width, dlCanvas.height);
    ctx.clip();
    
    draggableElements.forEach(el => {
        ctx.save();
        ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
        ctx.translate(el.x, el.y);
        ctx.rotate((el.rotation || 0) * Math.PI / 180);
        
        ctx.textAlign = el.align || 'center';
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
    ctx.restore();
    
    const link = document.createElement('a');
    link.download = `photobooth-pro-${Date.now()}.png`;
    link.href = dlCanvas.toDataURL('image/png', 1.0);
    link.click();
    
    showToast('Đã tải ảnh PNG chất lượng cao thành công! 🎉');
}

// ================= SHARING (WEB SHARE API) =================
async function shareFinalImage() {
    try {
        const dataUrl = getFinalImageDataUrl();
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'photobooth-pro.png', { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Photobooth Pro',
                text: 'Ảnh chụp photobooth cực xinh của tôi ✨'
            });
            showToast('Đã chia sẻ thành công! 📱');
        } else {
            showToast('Trình duyệt chưa hỗ trợ chia sẻ trực tiếp. Đã lưu ảnh về máy.');
            downloadImage();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showToast('Không thể chia sẻ. Đã lưu ảnh về máy.');
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
    
    // Clip to canvas bounds so elements dragged outside are cropped
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, dlCanvas.width, dlCanvas.height);
    ctx.clip();
    
    draggableElements.forEach(el => {
        ctx.save();
        ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
        ctx.translate(el.x, el.y);
        ctx.rotate((el.rotation || 0) * Math.PI / 180);
        ctx.textAlign = el.align || 'center';
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
    ctx.restore();
    
    return dlCanvas.toDataURL('image/png', 1.0);
}

// ================= REAL QR GENERATION VIA FREE HOSTING API =================
async function openQRModal() {
    const modal = document.getElementById('qrModal');
    const qrLoading = document.getElementById('qrLoading');
    const qrContainer = document.getElementById('qrContainer');
    
    modal.classList.remove('hidden');
    qrLoading.classList.remove('hidden');
    qrContainer.classList.add('hidden');
    
    try {
        if (typeof QRCode === 'undefined') {
            showToast('Thư viện QR chưa tải xong. Vui lòng thử lại.');
            modal.classList.add('hidden');
            return;
        }
        
        const dataUrl = getFinalImageDataUrl();
        const blob = await (await fetch(dataUrl)).blob();
        
        const formData = new FormData();
        formData.append('file', blob, 'photobooth-pro.png');
        
        // Upload file to free tmpfiles.org server in the background
        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('CORS / Network upload error');
        
        const json = await response.json();
        if (json.status === 'success' && json.data && json.data.url) {
            // Convert page URL to direct download URL (tmpfiles.org/XXXX -> tmpfiles.org/dl/XXXX)
            const dlUrl = json.data.url.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
            
            const qrCanvas = document.getElementById('qrCanvas');
            QRCode.toCanvas(qrCanvas, dlUrl, {
                width: 220,
                margin: 2,
                color: {
                    dark: '#0f0f1a',
                    light: '#ffffff'
                }
            });
            
            qrLoading.classList.add('hidden');
            qrContainer.classList.remove('hidden');
            showToast('Tạo mã QR tải ảnh thành công! 📱');
        } else {
            throw new Error('Invalid format returned');
        }
    } catch (err) {
        console.error("QR Code Upload Error:", err);
        qrLoading.classList.add('hidden');
        qrContainer.classList.remove('hidden');
        
        // Fallback: Generate local QR pointing to a placeholder text warning of excessive size
        const qrCanvas = document.getElementById('qrCanvas');
        QRCode.toCanvas(qrCanvas, 'Ảnh quá lớn để tạo QR trực tiếp. Vui lòng dùng nút tải ảnh.', {
            width: 220,
            margin: 2
        });
        showToast('Không thể upload ảnh lên cloud. Vui lòng sử dụng Tải ảnh PNG!');
    }
}

function closeQRModal() {
    document.getElementById('qrModal').classList.add('hidden');
}

// ================= DYNAMIC GIF / BOOMERANG EXPORTS =================
function setGifDelay(ms, btn) {
    gifDelay = ms;
    document.getElementById('gifSpeedLabel').textContent = ms + 'ms';
    
    document.querySelectorAll('.speed-pill').forEach(p => {
        p.classList.remove('active');
        p.style.background = 'rgba(255, 255, 255, 0.05)';
        p.style.color = 'var(--text-sub)';
        p.style.border = '1px solid var(--card-border)';
        p.style.boxShadow = 'none';
    });
    
    btn.classList.add('active');
    btn.style.background = 'var(--btn-gradient)';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.boxShadow = '0 0 10px rgba(181, 108, 255, 0.4)';
}

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
    document.getElementById('gifStatus').textContent = 'Đang ghép frame GIF...';
    
    try {
        // Fetch worker logic locally to bypass cross-origin browser policies
        const workerBlob = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js').then(r => r.blob());
        const workerURL = URL.createObjectURL(workerBlob);
        
        const gif = new GIF({
            workers: 2,
            quality: 10,
            workerScript: workerURL
        });
        
        for (const src of selectedImages) {
            const img = new Image();
            img.src = src;
            await new Promise(r => img.onload = r);
            
            const c = document.createElement('canvas');
            c.width = 450; 
            c.height = 600;
            const cx = c.getContext('2d');
            
            // Apply current filters and color adjustments to frames
            let cssFilter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px)`;
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
            }
            cx.filter = cssFilter;
            
            const ratio = img.width / img.height;
            let dw, dh, dx, dy;
            if (ratio > c.width / c.height) { 
                dh = c.height; dw = dh * ratio; dx = (c.width - dw) / 2; dy = 0; 
            } else { 
                dw = c.width; dh = dw / ratio; dx = 0; dy = (c.height - dh) / 2; 
            }
            cx.drawImage(img, dx, dy, dw, dh);
            cx.filter = 'none';
            
            gif.addFrame(c, { delay: gifDelay });
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
        console.error(err);
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
    document.getElementById('gifStatus').textContent = 'Đang ghép frame Boomerang...';
    
    try {
        // Create boomerang loop sequence: 1 -> 2 -> 3 -> 4 -> 3 -> 2
        const boomerangSequence = [...selectedImages];
        for (let i = selectedImages.length - 2; i > 0; i--) {
            boomerangSequence.push(selectedImages[i]);
        }
        
        const workerBlob = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js').then(r => r.blob());
        const workerURL = URL.createObjectURL(workerBlob);
        
        const gif = new GIF({
            workers: 2, 
            quality: 10,
            workerScript: workerURL
        });
        
        for (const src of boomerangSequence) {
            const img = new Image();
            img.src = src;
            await new Promise(r => img.onload = r);
            
            const c = document.createElement('canvas');
            c.width = 450; 
            c.height = 600;
            const cx = c.getContext('2d');
            
            let cssFilter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) blur(${adjustments.blur}px)`;
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
            }
            cx.filter = cssFilter;
            
            const ratio = img.width / img.height;
            let dw, dh, dx, dy;
            if (ratio > c.width / c.height) { 
                dh = c.height; dw = dh * ratio; dx = (c.width - dw) / 2; dy = 0; 
            } else { 
                dw = c.width; dh = dw / ratio; dx = 0; dy = (c.height - dh) / 2; 
            }
            cx.drawImage(img, dx, dy, dw, dh);
            cx.filter = 'none';
            
            // Boomerang speed defaults to a bit faster: gifDelay * 0.7
            gif.addFrame(c, { delay: Math.round(gifDelay * 0.7) });
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
        console.error(err);
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

// ================= MOBILE LIVE CAMERA FUNCTIONS =================
function toggleMobileBeauty() {
    const drawer = document.getElementById('mobileBeautyDrawer');
    const isActive = drawer.classList.contains('open');
    closeAllMobileDrawers();
    if (!isActive) {
        drawer.classList.add('open');
        document.getElementById('btnMobileBeauty').classList.add('active');
    }
}

function toggleMobileFilterDrawer() {
    const drawer = document.getElementById('mobileFilterDrawer');
    const isActive = drawer.classList.contains('open');
    closeAllMobileDrawers();
    if (!isActive) {
        drawer.classList.add('open');
        const btn = document.getElementById('mobileFilterBtn');
        if (btn) btn.classList.add('active');
    }
}

function toggleMobileTimerDrawer() {
    const drawer = document.getElementById('mobileTimerDrawer');
    const isActive = drawer.classList.contains('open');
    closeAllMobileDrawers();
    if (!isActive) {
        drawer.classList.add('open');
        const btn = document.getElementById('mobileTimerBtn');
        if (btn) btn.classList.add('active');
    }
}

function toggleMobileBgDrawer() {
    const drawer = document.getElementById('mobileBgDrawer');
    const isActive = drawer.classList.contains('open');
    closeAllMobileDrawers();
    if (!isActive) {
        drawer.classList.add('open');
        document.getElementById('btnMobileBg').classList.add('active');
    }
}

function toggleMobileMirrorMode() {
    isMirrorMode = !isMirrorMode;
    
    // Sync PC mirror checkbox if it exists
    const mirrorToggle = document.getElementById('mirrorToggle');
    if (mirrorToggle) mirrorToggle.checked = isMirrorMode;
    
    const mobBtn = document.getElementById('mobileMirrorBtn');
    if (mobBtn) {
        if (isMirrorMode) mobBtn.classList.add('active');
        else mobBtn.classList.remove('active');
    }
    
    applyVideoTransform();
    showToast(isMirrorMode ? 'Đã bật chế độ lật gương ⇄' : 'Đã tắt chế độ lật gương ⇄');
}

function toggleMobileAutoCapture() {
    autoCaptureEnabled = !autoCaptureEnabled;
    const btnMobileAutoCapture = document.getElementById('mobileAutoBtn');
    if (btnMobileAutoCapture) {
        btnMobileAutoCapture.classList.toggle('active', autoCaptureEnabled);
    }
    const pcToggle = document.getElementById('autoCaptureToggle');
    if (pcToggle) pcToggle.checked = autoCaptureEnabled;
    
    if (!autoCaptureEnabled) {
        faceAlignedSince = 0;
        isAutoCaptureWaiting = false;
    }
    
    showToast(autoCaptureEnabled ? "Auto Capture đã bật ⚡" : "Auto Capture đã tắt");
}

function selectMobileBg(boxEl) {
    document.querySelectorAll('.mobile-bg-drawer .filter-preview-box').forEach(box => box.classList.remove('active'));
    if (boxEl) boxEl.classList.add('active');
}

function closeAllMobileDrawers() {
    const drawers = ['mobileFilterDrawer', 'mobileTimerDrawer', 'mobileBgDrawer', 'mobileBeautyDrawer'];
    drawers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('open');
    });
    
    const btns = ['btnMobileBeauty', 'mobileFilterBtn', 'mobileTimerBtn', 'btnMobileBg'];
    btns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
}

function setMobileTimer(seconds, pillEl) {
    setTimer(seconds);
    document.querySelectorAll('.mobile-timer-drawer .timer-pill').forEach(btn => btn.classList.remove('active'));
    if (pillEl) pillEl.classList.add('active');
    showToast(`Hẹn giờ chụp: ${seconds === 0 ? 'Tắt' : seconds + ' giây'}`);
}

function handleMobileCapture() {
    if (isCapturing) return;
    startCountdown();
}

// Bind load listeners
window.addEventListener('DOMContentLoaded', init);
