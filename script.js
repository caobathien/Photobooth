// ================= STATE VARIABLES =================
let selectedLayout = null; // '2-strip', '4-strip', '2x2-grid'
let maxImages = 0;
let capturedImages = []; // Stores all 6 captured data URLs
let selectedImages = []; // Stores selected images to be put in template
let selectedSelectionIndices = []; // Indices of selected photos (from 0 to 5)
let cameraStream = null;
let currentFacingMode = 'user';
let isCapturing = false;
let currentZoom = 1;

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
function selectLayout(type) {
    if (type === '4-strip' && !hasSeenSupportPopup) {
        document.getElementById('supportModal').classList.remove('hidden');
        return;
    }
    
    selectedLayout = type;
    
    // Update UI
    document.querySelectorAll('.card').forEach(card => card.classList.remove('selected'));
    const cardEl = document.querySelector(`.card[data-layout="${type}"]`);
    if (cardEl) cardEl.classList.add('selected');
    
    btnEnterRoom.disabled = false;
    
    if (type === '2-strip') maxImages = 2;
    else if (type === '4-strip') maxImages = 4;
    else if (type === '2x2-grid') maxImages = 4;
}

function closeSupportModal() {
    document.getElementById('supportModal').classList.add('hidden');
    // Bỏ qua hoặc đóng vẫn cho phép chọn
    hasSeenSupportPopup = true;
    selectLayout('4-strip');
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
    
    if (tabName === 'filters') {
        document.getElementById('cameraTabFilters').classList.remove('hidden');
        document.getElementById('cameraTabReshape').classList.add('hidden');
    } else {
        document.getElementById('cameraTabFilters').classList.add('hidden');
        document.getElementById('cameraTabReshape').classList.remove('hidden');
    }
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
    cameraVideo.style.transform = `scale(${currentFacingMode === 'user' ? -currentZoom : currentZoom}, ${currentZoom})`;
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
    
    const selectedTimer = parseInt(document.getElementById('timerSelect').value);
    
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
    const videoRatio = video.videoWidth / video.videoHeight;
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
    drawVideoCoverToCanvas(cameraVideo, captureCanvas, isMirror);
    
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
    
    const el = {
        type: 'text',
        content: input.value,
        x: interactiveLayer.offsetWidth / 2,
        y: interactiveLayer.offsetHeight / 2,
        fontSize: 30,
        font: font,
        color: color,
        rotation: 0
    };
    
    draggableElements.push(el);
    input.value = '';
    renderInteractiveElements();
    selectElement(draggableElements.length - 1);
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
    if (frameBg.startsWith('linear-gradient')) {
        // Simple parsing for our predefined gradients
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        if (frameBg.includes('b56cff')) {
            gradient.addColorStop(0, '#b56cff');
            gradient.addColorStop(1, '#ff5fb7');
        } else {
            gradient.addColorStop(0, '#4facfe');
            gradient.addColorStop(1, '#00f2fe');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = frameBg;
        ctx.fillRect(0, 0, width, height);
    }

    // 1b. Draw Effects / Overlay on the background (behind photos)
    if (currentOverlay !== 'none') {
        drawOverlay(ctx, width, height, currentOverlay);
    }

    // 2. Draw Images (Object-fit cover)
    for (let i = 0; i < maxImages; i++) {
        if (!selectedImages[i]) continue;
        
        const rect = imgRects[i];
        
        const img = new Image();
        img.src = selectedImages[i];
        await new Promise(r => img.onload = r);
        
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
    ctx.fillStyle = getTextColorForBg(frameBg);
    ctx.textAlign = 'center';
    
    // Logo text
    ctx.font = 'bold 30px "Syne", sans-serif';
    ctx.fillText('Photobooth Pro', width / 2, height - padding / 1.5);
    
    if (showDateStamp) {
        const date = new Date();
        const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
        ctx.font = '500 20px "Space Grotesk", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, width - padding, height - padding / 1.5);
    }
    
    // 4. Removed overlay from here because it's now drawn before images
}

// Utility to determine if text should be white or black based on bg
function getTextColorForBg(bg) {
    if (bg === '#ffffff' || bg === '#ffd1dc' || bg === '#aaffc3' || bg === '#fffacd') return '#000000';
    return '#ffffff';
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
            div.style.fontWeight = '700';
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
        
        // Auto-switch to text tab if not already there
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
        ctx.translate(el.x, el.y);
        ctx.rotate(el.rotation * Math.PI / 180);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (el.type === 'sticker') {
            ctx.font = `${el.fontSize}px sans-serif`;
            ctx.fillText(el.content, 0, 0);
        } else if (el.type === 'text') {
            ctx.font = `700 ${el.fontSize}px "${el.font}", sans-serif`;
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
