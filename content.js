// content.js
let segments = [];
let currentStart = null;
let isLooping = false;
let currentSegmentIndex = 0;
let markers = [];
let segmentHighlights = [];
let currentVideoId = '';

//Color Scheme
const colors = {
  start: "#00C853", // green
  end: "#FF3D00",   // red
  highlight: "rgba(0, 200, 83, 0.25)",
  menuBg: "#212121",
  menuBorder: "#424242",
  menuText: "#FFFFFF",
  disabled: "#616161"
};

//Control Key
const controlKey = 'altKey'; // shiftKey / ctrlKey / metaKey
let wasAltClicked = false;

let segmentTimeout = null;
let isSegmentPlaying = false;
let currentSegmentEnd = null;

// SVG Icons
const icons = {
  start: `<svg width="16" height="16" viewBox="0 0 24 24" fill="${colors.start}" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 4H6V6H18V4Z" fill="${colors.start}"/>
            <path d="M18 18H6V20H18V18Z" fill="${colors.start}"/>
            <rect x="11" y="6" width="2" height="12" rx="1" fill="${colors.start}"/>
          </svg>`,
  end: `<svg width="16" height="16" viewBox="0 0 24 24" fill="${colors.end}" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 4H6V6H18V4Z" fill="${colors.end}"/>
          <path d="M18 18H6V20H18V18Z" fill="${colors.end}"/>
          <rect x="11" y="6" width="2" height="12" rx="1" fill="${colors.end}"/>
        </svg>`,
  play: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#448AFF" xmlns="http://www.w3.org/2000/svg">
           <path d="M8 5V19L19 12L8 5Z" fill="#448AFF"/>
         </svg>`,
  loop: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFC400" xmlns="http://www.w3.org/2000/svg">
           <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4ZM12 18C8.69 18 6 15.31 6 12C6 10.99 6.25 10.03 6.7 9.2L5.24 7.74C4.46 8.97 4 10.43 4 12C4 16.42 7.58 20 12 20V23L16 19L12 15V18Z" fill="#FFC400"/>
         </svg>`,
  clear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#9E9E9E" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="#9E9E9E"/>
          </svg>`,
  youtube: `<svg width="16" height="16" viewBox="0 0 24 24" fill="#FF0000" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 15L15 12L10 9V15Z" fill="white"/>
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="#FF0000"/>
            </svg>`
};

// Storage Functions
function getVideoId(url) {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
  return match ? match[1] : null;
}

function saveSegments() {
  if (!currentVideoId) return;

  chrome.storage.local.set({ [`segments_${currentVideoId}`]: segments }, () => {
    console.log('Segments saved for video:', currentVideoId);
  });
}

function loadSegments(callback) {
  if (!currentVideoId) return callback([]);

  chrome.storage.local.get([`segments_${currentVideoId}`], (result) => {
    const loadedSegments = result[`segments_${currentVideoId}`] || [];
    console.log('Loaded segments for video:', currentVideoId, loadedSegments);
    callback(loadedSegments);
  });
}

function clearCurrentSegments() {
  if (!currentVideoId) return;

  chrome.storage.local.remove([`segments_${currentVideoId}`], () => {
    console.log('Cleared segments for video:', currentVideoId);
  });
}

// DOM Elements
function getPlayer() {
  return document.querySelector('video');
}

function getProgressBar() {
  return document.querySelector(".ytp-progress-bar");
}

function getProgressBarContainer() {
  return document.querySelector(".ytp-progress-bar-container");
}

// Segment Validation
function isTimeInSegment(time) {
  return segments.some(segment => time >= segment.start && time <= segment.end);
}

function segmentsOverlap(start, end) {
  return segments.some(segment => {
    return (start >= segment.start && start <= segment.end) ||
           (end >= segment.start && end <= segment.end) ||
           (start <= segment.start && end >= segment.end);
  });
}

// Marker and Segment Management
function addMarker(time, type) {
  const progressBar = getProgressBar();
  if (!progressBar) return;

  const duration = getPlayer().duration;
  const percentage = (time / duration) * 100;

  const marker = document.createElement("div");
  marker.className = `yt-looper-marker yt-looper-marker-${type}`;
  marker.dataset.time = time;
  marker.dataset.type = type;
  marker.style.position = "absolute";
  marker.style.left = `${percentage}%`;
  marker.style.height = "150%";
  marker.style.top = "-25%";
  marker.style.width = "6px";
  marker.style.backgroundColor = type === 'start' ? colors.start : colors.end;
  marker.style.border = "1px solid white";
  marker.style.zIndex = "9999";
  marker.style.pointerEvents = "auto";
  marker.style.cursor = "pointer";
  marker.style.borderRadius = "3px";
  marker.style.boxShadow = "0 0 4px rgba(0,0,0,0.5)";
  marker.style.transition = "all 0.2s ease";

  // Add control+click event for marker
  marker.addEventListener("click", (e) => {
    if (e[controlKey]) {
      e.stopPropagation();
      showMarkerContextMenu(marker, e.clientX, e.clientY);
    }
  });

  progressBar.appendChild(marker);
  markers.push(marker);
}

function updateSegmentHighlights() {
  clearSegmentHighlights();
  clearMarkers();

  segments.forEach((segment, index) => {
    const progressBar = getProgressBar();
    if (!progressBar) return;

    const duration = getPlayer().duration;

    // Only add markers that exist
    if (segment.start !== null) {
      addMarker(segment.start, 'start');
    }
    if (segment.end !== null) {
      addMarker(segment.end, 'end');
    }

    // Only create highlight if both markers exist
    if (segment.start !== null && segment.end !== null) {
      const startPercentage = (segment.start / duration) * 100;
      const endPercentage = (segment.end / duration) * 100;
      const widthPercentage = endPercentage - startPercentage;

      const highlight = document.createElement('div');
      highlight.className = 'yt-looper-segment-highlight';
      highlight.dataset.segmentIndex = index;
      highlight.style.left = `${startPercentage}%`;
      highlight.style.width = `${widthPercentage}%`;
      highlight.style.height = '100%';
      highlight.style.backgroundColor = colors.highlight;
      highlight.style.position = 'absolute';
      highlight.style.zIndex = '9998';
      highlight.style.pointerEvents = 'auto';
      highlight.style.cursor = 'pointer';
      highlight.style.borderRadius = '2px';

      highlight.addEventListener('click', (e) => {
        if (e[controlKey]) {
          pausePlayer();
          e.stopPropagation();
          showSegmentContextMenu(index, e.clientX, e.clientY);
        }
      });

      progressBar.appendChild(highlight);
      segmentHighlights.push(highlight);
    }
  });

  updateMenuItemsState();
  saveSegments();
}

function clearMarkers() {
  markers.forEach(marker => marker.remove());
  markers = [];
}

function clearSegmentHighlights() {
  segmentHighlights.forEach(highlight => highlight.remove());
  segmentHighlights = [];
}

function removeMarker(markerElement) {
  const time = parseFloat(markerElement.dataset.time);
  const type = markerElement.dataset.type;

  // Remove the marker from DOM
  markerElement.remove();
  markers = markers.filter(m => m !== markerElement);

  // Find the segment containing this marker
  const segmentIndex = segments.findIndex(segment =>
    (type === 'start' && segment.start === time) ||
    (type === 'end' && segment.end === time)
  );

  if (segmentIndex !== -1) {
    if (type === 'start') {
      // Just remove the start marker
      segments[segmentIndex].start = null;
    } else if (type === 'end') {
      // Just remove the end marker
      segments[segmentIndex].end = null;
    }

    // Remove segment only if BOTH markers are now null
    if (segments[segmentIndex].start === null && segments[segmentIndex].end === null) {
      segments.splice(segmentIndex, 1);
    }
  }

  updateSegmentHighlights();
  hideCustomMenu();
}



function removeSegment(index) {
  if (index >= 0 && index < segments.length) {
    segments.splice(index, 1);
    updateSegmentHighlights();
  }
}

// Segment Actions
function startSegment() {
  const player = getPlayer();
  if (!player) return;

  const time = player.currentTime;

  // Don't allow starting inside existing segments
  if (isTimeInSegment(time)) {
    return;
  }

  currentStart = time;
  clearMarkers();
  addMarker(currentStart, 'start');
  hideCustomMenu();
}

function endSegment() {
  const player = getPlayer();
  if (!player || currentStart === null) return;

  const end = player.currentTime;

  // Validate the segment
  if (end <= currentStart || segmentsOverlap(currentStart, end)) {
    return;
  }

  segments.push({ start: currentStart, end });
  hideCustomMenu();
  updateSegmentHighlights();
  currentStart = null;
}

function playSegments(loop = false) {
  const player = getPlayer();
  if (!player || !segments.length) return;

  // Stop any existing playback
  stopSegmentPlayback();

  // Sort segments by start time
  segments.sort((a, b) => a.start - b.start);

  isLooping = loop;
  currentSegmentIndex = 0;
  isSegmentPlaying = true;

  // Start playing the first segment
  playCurrentSegment();
  hideCustomMenu();
}

function playCurrentSegment() {
  const player = getPlayer();
  if (!player || !isSegmentPlaying) return;

  // Get current segment
  const segment = segments[currentSegmentIndex];
  player.currentTime = segment.start;
  currentSegmentEnd = segment.end;
  player.play();

  // Set up position checker
  checkSegmentPosition();
}

function checkSegmentPosition() {
  if (!isSegmentPlaying) return;

  const player = getPlayer();
  if (!player) return;

  // Check if we reached the end of the segment
  if (player.currentTime >= currentSegmentEnd - 0.1) {
    player.pause();

    // Move to next segment or loop
    currentSegmentIndex++;

    if (currentSegmentIndex >= segments.length) {
      if (isLooping) {
        currentSegmentIndex = 0;
      } else {
        stopSegmentPlayback();
        return;
      }
    }

    // Play next segment after a brief pause
    segmentTimeout = setTimeout(() => {
      if (isSegmentPlaying) {
        playCurrentSegment();
      }
    }, 50);
    return;
  }

  // Continue checking position
  segmentTimeout = setTimeout(checkSegmentPosition, 100);
}

function stopSegmentPlayback() {
  clearTimeout(segmentTimeout);
  segmentTimeout = null;
  isSegmentPlaying = false;
  currentSegmentEnd = null;

  const player = getPlayer();
  if (player) {
    player.pause();
  }
}

function playNextSegment() {
  const player = getPlayer();
  if (!player || !segments.length) return;

  // Sort segments by start time before playing
  segments.sort((a, b) => a.start - b.start);

  // Reset if we've reached the end
  if (currentSegmentIndex >= segments.length) {
    if (isLooping) {
      currentSegmentIndex = 0;
    } else {
      return;
    }
  }

  const { start, end } = segments[currentSegmentIndex];
  player.currentTime = start;
  player.play();

  // Clear any existing timeupdate listener
  player.removeEventListener("timeupdate", player.segmentTimeUpdateHandler);

  // Create new timeupdate handler
  player.segmentTimeUpdateHandler = () => {
    // Check for pause request
    if (window.wasAltClicked) {
      player.removeEventListener("timeupdate", player.segmentTimeUpdateHandler);
      window.wasAltClicked = false;
      return;
    }

    // When we reach near the end of the segment
    if (player.currentTime >= end - 0.1) {
      player.pause();
      player.removeEventListener("timeupdate", player.segmentTimeUpdateHandler);

      // Move to next segment
      currentSegmentIndex++;

      // If looping and at end, start from beginning
      if (isLooping && currentSegmentIndex >= segments.length) {
        currentSegmentIndex = 0;
      }

      // Play next segment if available
      if (currentSegmentIndex < segments.length) {
        playNextSegment();
      }
    }
  };

  player.addEventListener("timeupdate", player.segmentTimeUpdateHandler);
}

function pausePlayer() {
  const player = getPlayer();
  if (!player) return;
  player.pause();
}

function playNormal() {
  const player = getPlayer();
  if (!player) return;

  player.play();
  hideCustomMenu();
}

function clearAll() {
 stopSegmentPlayback();
  segments = [];
  currentStart = null;
  clearMarkers();
  clearSegmentHighlights();
  clearCurrentSegments();
  hideCustomMenu();
}

// Menu System
function createCustomMenu() {
  const menu = document.createElement("div");
  menu.id = "yt-looper-menu";
  menu.style.position = "absolute";
  menu.style.zIndex = "10000";
  menu.style.background = colors.menuBg;
  menu.style.color = colors.menuText;
  menu.style.border = `1px solid ${colors.menuBorder}`;
  menu.style.padding = "8px 0";
  menu.style.borderRadius = "8px";
  menu.style.fontSize = "14px";
  menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  menu.style.display = "none";
  menu.style.minWidth = "200px";
  menu.style.fontFamily = "'Roboto', Arial, sans-serif";
  menu.style.transition = "opacity 0.2s, transform 0.2s";
  menu.style.opacity = "0";
  menu.style.transform = "translateY(10px)";

  // Main options
  const mainMenuItems = [
    { text: "Start", action: startSegment, icon: icons.start, id: "start-segment" },
    { text: "End", action: endSegment, icon: icons.end, id: "end-segment" },
    { text: "Play Segments", action: () => playSegments(false), icon: icons.play, id: "play-segment" },
    { text: "Loop Segments", action: () => playSegments(true), icon: icons.loop, id: "loop-segment" },
    { text: "Clear All", action: clearAll, icon: icons.clear, id: "clear-all" },
    { text: "Normal Play", action: playNormal, icon: icons.youtube, id: "normal-play" }
  ];

  // Context options
  const clearMarkerItem = document.createElement("div");
  clearMarkerItem.id = "yt-looper-clear-marker";
  clearMarkerItem.style.padding = "8px 16px";
  clearMarkerItem.style.cursor = "pointer";
  clearMarkerItem.style.display = "none";
  clearMarkerItem.style.alignItems = "center";
  clearMarkerItem.style.gap = "12px";
  clearMarkerItem.innerHTML = `${icons.clear}<span>Clear Marker</span>`;
  clearMarkerItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.currentMarkerToClear) {
      removeMarker(window.currentMarkerToClear);
      window.currentMarkerToClear = null;
    }
    hideCustomMenu();
  });

  const clearSegmentItem = document.createElement("div");
  clearSegmentItem.id = "yt-looper-clear-segment";
  clearSegmentItem.style.padding = "8px 16px";
  clearSegmentItem.style.cursor = "pointer";
  clearSegmentItem.style.display = "none";
  clearSegmentItem.style.alignItems = "center";
  clearSegmentItem.style.gap = "12px";
  clearSegmentItem.innerHTML = `${icons.clear}<span>Clear Segment</span>`;
  clearSegmentItem.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.currentSegmentToClear !== undefined) {
      removeSegment(window.currentSegmentToClear);
      window.currentSegmentToClear = undefined;
    }
    hideCustomMenu();
  });

  // Add hover effects
  const addHoverEffect = (element) => {
    element.addEventListener("mouseenter", () => {
      if (!element.classList.contains('disabled')) {
        element.style.background = "#424242";
      }
    });
    element.addEventListener("mouseleave", () => {
      element.style.background = "transparent";
    });
  };

  // Create main menu items
  mainMenuItems.forEach(item => {
    const itemEl = document.createElement("div");
    itemEl.id = item.id;
    itemEl.style.padding = "10px 16px";
    itemEl.style.cursor = "pointer";
    itemEl.style.display = "flex";
    itemEl.style.alignItems = "center";
    itemEl.style.gap = "12px";
    itemEl.style.transition = "background 0.2s";
    itemEl.innerHTML = `${item.icon}<span>${item.text}</span>`;
    itemEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!itemEl.classList.contains('disabled')) {
        item.action();
      }
    });
    addHoverEffect(itemEl);
    menu.appendChild(itemEl);
  });

  // Add context items
  menu.appendChild(clearMarkerItem);
  menu.appendChild(clearSegmentItem);

  document.body.appendChild(menu);
  return menu;
}

function updateMenuItemsState() {
  const menu = document.getElementById("yt-looper-menu");
  if (!menu) return;

  const hasSegments = segments.length > 0;

  // Disable/enable menu items
  const playSegment = menu.querySelector("#play-segment");
  const loopSegment = menu.querySelector("#loop-segment");
  const clearAll = menu.querySelector("#clear-all");

  if (playSegment) {
    playSegment.classList.toggle("disabled", !hasSegments);
    playSegment.style.color = hasSegments ? colors.menuText : colors.disabled;
    playSegment.querySelector("svg").style.opacity = hasSegments ? "1" : "0.5";
  }

  if (loopSegment) {
    loopSegment.classList.toggle("disabled", !hasSegments);
    loopSegment.style.color = hasSegments ? colors.menuText : colors.disabled;
    loopSegment.querySelector("svg").style.opacity = hasSegments ? "1" : "0.5";
  }

  if (clearAll) {
    clearAll.classList.toggle("disabled", !hasSegments);
    clearAll.style.color = hasSegments ? colors.menuText : colors.disabled;
    clearAll.querySelector("svg").style.opacity = hasSegments ? "1" : "0.5";
  }
}

function showMarkerContextMenu(marker, x, y) {
  const menu = document.getElementById("yt-looper-menu");
  if (!menu) return;

  // Hide all items first
  menu.querySelectorAll("div").forEach(item => {
    item.style.display = "none";
  });

  // Show only Clear Marker option
  const clearMarkerItem = menu.querySelector("#yt-looper-clear-marker");
  if (clearMarkerItem) {
    clearMarkerItem.style.display = "flex";
  }

  window.currentMarkerToClear = marker;
  positionMenu(menu, x, y);
}


function showSegmentContextMenu(segmentIndex, x, y) {
  const menu = document.getElementById("yt-looper-menu");
  if (!menu) return;

  // Hide all items first
  menu.querySelectorAll("div").forEach(item => {
    item.style.display = "none";
  });

  // Show only Clear Segment option
  const clearSegmentItem = menu.querySelector("#yt-looper-clear-segment");
  if (clearSegmentItem) {
    clearSegmentItem.style.display = "flex";
  }

  window.currentSegmentToClear = segmentIndex;
  positionMenu(menu, x, y);
}

function showMainMenu(x, y) {
  const menu = document.getElementById("yt-looper-menu");
  if (!menu) return;

  // Hide all items first
  menu.querySelectorAll("div").forEach(item => {
    item.style.display = "none";
  });

  // Show only main menu items (not context items)
  const mainItems = [
    "start-segment",
    "end-segment",
    "play-segment",
    "loop-segment",
    "clear-all",
    "normal-play"
  ];

  mainItems.forEach(id => {
    const item = menu.querySelector(`#${id}`);
    if (item) {
      item.style.display = "flex";
    }
  });

  positionMenu(menu, x, y);
}


function positionMenu(menu, x, y) {
  const progressBarContainer = getProgressBarContainer();
  if (!progressBarContainer) return;

  const containerRect = progressBarContainer.getBoundingClientRect();
  const menuWidth = 200;
  const menuHeight = menu.offsetHeight;

  // Calculate position (avoid going off-screen)
  let left = x;
  let top = containerRect.top - menuHeight - 10;

  if (left + menuWidth > window.innerWidth) {
    left = window.innerWidth - menuWidth - 10;
  }

  if (top < 0) {
    top = containerRect.bottom + 10;
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.display = "block";
  setTimeout(() => {
    menu.style.opacity = "1";
    menu.style.transform = "translateY(0)";
  }, 10);
}

function hideCustomMenu() {
  const menu = document.getElementById("yt-looper-menu");
  if (menu) {
    menu.style.opacity = "0";
    menu.style.transform = "translateY(10px)";
    setTimeout(() => {
      menu.style.display = "none";
    }, 200);
  }
}

// Video URL Handling
function checkVideoChange() {
  const newVideoId = getVideoId(window.location.href);

  if (newVideoId && newVideoId !== currentVideoId) {
    currentVideoId = newVideoId;
    clearMarkers();
    clearSegmentHighlights();
    segments = [];
    currentStart = null;

    // Load segments for new video if available
    loadSegments((loadedSegments) => {
      segments = loadedSegments;
      updateSegmentHighlights();
    });
  }
}

// Initialize
function init() {

    window.wasAltClicked = false;
  // Wait for YouTube player to load
  const checkPlayer = setInterval(() => {
    if (getPlayer() && getProgressBar()) {
      clearInterval(checkPlayer);
      currentVideoId = getVideoId(window.location.href);
      createCustomMenu();
      setupEventListeners();

      // Load saved segments for this video
      loadSegments((loadedSegments) => {
        segments = loadedSegments;
        updateSegmentHighlights();
      });

      // Check for video changes
      setInterval(checkVideoChange, 1000);
    }
  }, 500);
}

function setupEventListeners() {
  // Control+Click handler for progress bar
 const progressBar = getProgressBar();
  if (!progressBar) return;

  progressBar.addEventListener('click', (e) => {
    pausePlayer();
    stopSegmentPlayback();
    if (!e[controlKey]) return;
    e.preventDefault();
    e.stopPropagation();

    // Check if clicked directly on a marker
    const marker = e.target.closest('.yt-looper-marker');
    if (marker) {
      showMarkerContextMenu(marker, e.clientX, e.clientY);
      return;
    }

    // Check if clicked within a segment highlight
    const highlight = e.target.closest('.yt-looper-segment-highlight');
    if (highlight) {
      const segmentIndex = parseInt(highlight.dataset.segmentIndex);
      showSegmentContextMenu(segmentIndex, e.clientX, e.clientY);
      return;
    }

    // Check if clicked between markers of a segment
    const clickTime = (e.offsetX / progressBar.offsetWidth) * getPlayer().duration;
    const clickedSegmentIndex = segments.findIndex(seg =>
      clickTime >= seg.start && clickTime <= seg.end
    );

    if (clickedSegmentIndex !== -1) {
      showSegmentContextMenu(clickedSegmentIndex, e.clientX, e.clientY);
      return;
    }

    // Otherwise show main menu
    showMainMenu(e.clientX, e.clientY);
  });

  // Hide menu when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('yt-looper-menu');
    if (menu && !menu.contains(e.target)) {
      hideCustomMenu();
    }
  });

  // Prevent YouTube's native double-click behavior
  document.addEventListener('dblclick', (e) => {
    const bar = getProgressBar();
    if (bar && bar.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

    document.addEventListener('mousedown', (e) => {
    if (e.altKey) {
        window.wasAltClicked = true;
        stopSegmentPlayback();
    }
    });
}


// Start the extension
init();