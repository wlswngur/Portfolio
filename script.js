// Theme Logic
function updateThemeColor() {
  const isDark = document.documentElement.classList.contains('dark-mode');
  const color = isDark ? '#131313' : '#f2f2f2';

  // Remove existing meta tag and create new one to force Safari to update
  let meta = document.getElementById('theme-color-meta');
  if (meta) {
    meta.remove();
  }

  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.id = 'theme-color-meta';
  meta.content = color;
  document.head.appendChild(meta);
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
  updateThemeColor();
}
initTheme();

// Global Theme Toggle Listener (Event Delegation)
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('#themeToggle');
  if (toggle) {
    e.preventDefault();
    e.stopPropagation();
    document.documentElement.classList.toggle('dark-mode');
    const isDark = document.documentElement.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeColor();
    console.log('Theme toggled via delegation. Dark mode:', isDark);
  }
});

let grid = document.getElementById("grid");
let zoomBtn = document.getElementById("zoomBtn");
let items = [];

const GAP_MAP = { 1: 28, 3: 24, 5: 20 };
const MIN_ITEM = { 1: 280, 3: 240, 5: 200 };

let layout = 1;
let zoomDir = -1;
let activeItem = null;
let savedScrollY = 0;
let isAnimating = false; // Track animation state

const CONCERTINA_FRAME_COUNT = 61; // 0000 to 0060
let concertinaFramesLoaded = false;
let concertinaFrames = [];
let concertinaAnimating = false;
let concertinaExpanded = false;

let activeItemRect = null;
let transitionClone = null;

// Track clicked item for hero transition
document.addEventListener('click', (e) => {
  const itemLink = e.target.closest('.item');
  // Skip if not a link (Coming Soon items use div, not a tag)
  if (itemLink && itemLink.tagName === 'A') {
    activeItem = itemLink.querySelector('img');
    if (activeItem) {
      // For all items (like Item 1), use the container bounds
      const rect = activeItem.getBoundingClientRect();
      const cloneRect = {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };

      activeItemRect = cloneRect;

      // Create clone immediately to capture exact state
      transitionClone = activeItem.cloneNode(true);
      transitionClone.style.cssText = `
        position: fixed;
        top: ${cloneRect.top}px;
        left: ${cloneRect.left}px;
        width: ${cloneRect.width}px;
        height: ${cloneRect.height}px;
        z-index: 9999;
        object-fit: contain;
        background-color: transparent;
        transition: none;
        transform: translateZ(0);
        margin: 0;
        pointer-events: none;
        opacity: 1;
        will-change: top, left, width, height;
        backface-visibility: hidden;
      `;
      document.body.appendChild(transitionClone);

      // Hide original immediately
      gsap.set(activeItem, { opacity: 0 });

      // Capture scroll position immediately
      savedScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      // Stop scroll momentum immediately to prevent flicker
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      // Compensate for scrollbar if it exists
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
        const header = document.querySelector('header');
        if (header) header.style.marginRight = `${scrollbarWidth}px`;
      }
    }
  }
});

// =============================================================================
// GRID LAYOUT LOGIC
// =============================================================================

function calcItemWidth(gridWidth, columns) {
  const gap = GAP_MAP[columns];
  return Math.floor((gridWidth - gap * (columns - 1)) / columns);
}

function pickLayoutByWidth(gridWidth) {
  const isMobile = window.innerWidth <= 600;
  if (!isMobile) {
    const effectiveWidth = gridWidth || (window.innerWidth - 48);
    const w5 = calcItemWidth(effectiveWidth, 5);
    if (w5 >= MIN_ITEM[5]) return 5;
    const w3 = calcItemWidth(effectiveWidth, 3);
    if (w3 >= MIN_ITEM[3]) return 3;
    return 1;
  } else {
    const effectiveWidth = gridWidth || (window.innerWidth - 32);
    const w3 = calcItemWidth(effectiveWidth, 3);
    if (w3 >= MIN_ITEM[3]) return 3;
    return 1;
  }
}

// A3 Aspect Ratio (Portrait)
const ASPECT_RATIO = 1.414;

function layoutPositions(columns) {
  const positions = [];
  const gridWidth = grid.clientWidth;
  let gap = GAP_MAP[columns];

  const isMobile = window.innerWidth <= 600;
  if (isMobile && columns === 3) {
    gap = 8;
  }
  if (isMobile && columns === 1) {
    gap = 16;
  }

  // Standard cell width (what used to be itemWidth)
  let cellWidth = Math.floor((gridWidth - gap * (columns - 1)) / columns);

  // Default: Square items
  let itemHeight = cellWidth;

  if (columns === 1) {
    const HEADER_H = 72;
    const SAFE_VPAD = 48;
    // Ensure it fits vertically even with aspect ratio
    const maxByHeight = Math.floor(window.innerHeight - HEADER_H - SAFE_VPAD);
    if (itemHeight > maxByHeight) {
      itemHeight = maxByHeight;
      cellWidth = itemHeight; // For 1 column, width follows height if constrained
    }
  }

  const contentWidth = columns * cellWidth + gap * (columns - 1);
  const offsetX = Math.max(0, Math.floor((gridWidth - contentWidth) / 2));

  items.forEach((_, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);

    let width = cellWidth;
    let height = itemHeight;
    let x = offsetX + col * (cellWidth + gap);
    // Add extra vertical spacing for labels (e.g. 30px)
    let y = row * (itemHeight + gap + 30);

    // Special handling for items with specific aspect ratios (1, 3, 4)
    // Matches the container size to the image size to prevent cropping and simplify transitions
    const id = items[i].getAttribute('data-id');
    if (id === '1' || id === '3' || id === '4') {
      let ratio = ASPECT_RATIO;
      if (id === '3') {
        // Folded: 1920/1340 ≈ 1.4328, Expanded: 1920/1894 ≈ 1.0137
        ratio = isConcertinaExpanded() ? 1.0137 : 1.4328;
      }
      if (id === '4') ratio = 1.7778;

      // Maintain Aspect Ratio (Portrait) based on HEIGHT
      width = height / ratio;

      // Center the narrower item within the cell
      x += (cellWidth - width) / 2;
    }

    positions.push({ x, y, width, height });
  });

  const rows = Math.ceil(items.length / columns);
  // Include label spacing (30px) in grid height calculation
  const gridHeight = rows * (itemHeight + 30) + (rows - 1) * gap;
  grid.style.height = `${gridHeight}px`;

  return positions;
}

function applyPositions(positions) {
  items.forEach((item, i) => {
    const { x, y, width, height } = positions[i];

    item.style.width = `${width}px`;
    item.style.height = `${height}px`;

    item.style.setProperty('--tx', `${x}px`);
    item.style.setProperty('--ty', `${y}px`);
  });
}

function updateLayout(columns) {
  const positions = layoutPositions(columns);
  applyPositions(positions);
  const hoverScale = columns === 5 ? 1.02 : columns === 3 ? 1.015 : 1.03;
  grid.style.setProperty('--hover-scale', hoverScale);
}

let isGridInitialized = false;

function initGrid() {
  grid = document.getElementById("grid");
  if (!grid) return;

  items = Array.from(document.querySelectorAll(".item"));

  const isMobile = window.innerWidth <= 600;
  const bestFit = isMobile ? 1 : pickLayoutByWidth(grid.clientWidth);
  const maxAllowed = isMobile ? 3 : 5;

  if (!isGridInitialized) {
    layout = bestFit;
    zoomDir = isMobile ? 1 : -1;
    isGridInitialized = true;
  } else {
    // Preserve layout unless it exceeds max allowed
    if (layout > maxAllowed) {
      layout = maxAllowed;
    }
  }

  // Update Item 3 thumbnail to match concertina state
  const item3 = items.find(item => item.getAttribute('data-id') === '3');
  if (item3) {
    const img = item3.querySelector('img');
    if (img) {
      const frameIndex = isConcertinaExpanded() ? CONCERTINA_FRAME_COUNT - 1 : 0;
      img.src = `assets/Concertina_sequence/Concertina${String(frameIndex).padStart(4, '0')}.webp`;
    }
  }

  updateLayout(layout);
  updateZoomIcon();
}

// =============================================================================
// ICON & PANEL LOGIC
// =============================================================================

let iconState;
function setBackIcon() {
  zoomBtn.setAttribute('aria-pressed', 'true');
  iconState = 'back';
}
function setPlusIcon() {
  zoomBtn.setAttribute('aria-pressed', 'false');
  iconState = 'plus';
}
function toBackIcon() { setBackIcon(); }
function toPlusIcon() { setPlusIcon(); }

function updateZoomIcon() {
  const isMobile = window.innerWidth <= 600;
  if (isMobile) {
    if (layout === 1) setBackIcon();
    else setPlusIcon();
  } else {
    if (layout === 1) {
      setBackIcon();
    } else if (layout === 5) {
      setPlusIcon();
    } else {
      // Layout 3: depends on direction
      if (zoomDir === -1) setPlusIcon(); // Zooming In (5 -> 3)
      else setBackIcon(); // Zooming Out (1 -> 3)
    }
  }
}

// Panels
const aboutBtn = document.querySelector('.about-btn');
const contactBtn = document.querySelector('.contact-btn');
const aboutPanel = document.getElementById('aboutPanel');
const contactPanel = document.getElementById('contactPanel');
let aboutPrevIcon = null;
let contactPrevIcon = null;

// Panel Event Listeners (Global - persist across Barba transitions)
// We only need to attach these ONCE if the header/panels are outside Barba container.
// Since they are outside, we can keep them here.

aboutPanel?.addEventListener('transitionend', (e) => {
  if (e.propertyName !== 'height') return;
  if (!aboutPanel.classList.contains('open')) {
    aboutPanel.hidden = true;
    aboutPanel.setAttribute('aria-hidden', 'true');
  }
});

contactPanel?.addEventListener('transitionend', (e) => {
  if (e.propertyName !== 'height') return;
  if (!contactPanel.classList.contains('open')) {
    contactPanel.hidden = true;
    contactPanel.setAttribute('aria-hidden', 'true');
  }
});

function waitForClose(panel, callback) {
  const handler = (e) => {
    if (e.propertyName !== 'height') return;
    if (!panel.classList.contains('open')) {
      panel.removeEventListener('transitionend', handler);
      callback();
    }
  };
  panel.addEventListener('transitionend', handler);
}

// Swipe up to close panels on mobile
function initSwipeToClose(panel, closeFn) {
  let touchStartY = 0;

  panel.addEventListener('touchstart', (e) => {
    touchStartY = e.changedTouches[0].screenY;
  }, {
    passive: true
  });

  panel.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].screenY;
    const swipeDistance = touchStartY - touchEndY; // Positive if swiped up

    // Threshold 50px for mobile
    if (swipeDistance > 50 && window.innerWidth <= 600) {
      if (panel.classList.contains('open')) {
        closeFn();
      }
    }
  }, {
    passive: true
  });
}

if (aboutPanel) initSwipeToClose(aboutPanel, closeAboutPanel);
if (contactPanel) initSwipeToClose(contactPanel, closeContactPanel);

function openAboutPanel() {
  if (!aboutPanel) return;

  // Lock scroll (html + body) IMMEDIATELY
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  if (contactPanel && (contactPanel.classList.contains('open') || !contactPanel.hidden)) {
    waitForClose(contactPanel, () => {
      aboutPanel.hidden = false;
      aboutPanel.setAttribute('aria-hidden', 'false');
      aboutPanel.classList.remove('open');
      void aboutPanel.offsetHeight;
      requestAnimationFrame(() => {
        aboutPrevIcon = iconState;
        aboutPanel.classList.add('open');
        toBackIcon();
        document.querySelector('.about-btn')?.classList.add('active');
      });
    });
    closeContactPanel(true); // keepScroll = true
    return;
  }

  aboutPanel.hidden = false;
  aboutPanel.setAttribute('aria-hidden', 'false');
  aboutPanel.classList.remove('open');
  void aboutPanel.offsetHeight;
  requestAnimationFrame(() => {
    aboutPrevIcon = iconState;
    aboutPanel.classList.add('open');
    toBackIcon();
    document.querySelector('.about-btn')?.classList.add('active');
  });
}

function closeAboutPanel(keepScroll = false) {
  if (!aboutPanel) return;
  aboutPanel.classList.remove('open');
  if (aboutPrevIcon === 'plus') toPlusIcon();
  else if (aboutPrevIcon === 'back') setBackIcon();
  aboutPrevIcon = null;
  document.querySelector('.about-btn')?.classList.remove('active');

  if (!keepScroll) {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }
}

function openContactPanel() {
  if (!contactPanel) return;

  // Lock scroll (html + body) IMMEDIATELY
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  if (aboutPanel && (aboutPanel.classList.contains('open') || !aboutPanel.hidden)) {
    waitForClose(aboutPanel, () => {
      contactPanel.hidden = false;
      contactPanel.setAttribute('aria-hidden', 'false');
      contactPanel.classList.remove('open');
      void contactPanel.offsetHeight;
      requestAnimationFrame(() => {
        contactPrevIcon = iconState;
        contactPanel.classList.add('open');
        toBackIcon();
        document.querySelector('.contact-btn')?.classList.add('active');
      });
    });
    closeAboutPanel(true); // keepScroll = true
    return;
  }

  contactPanel.hidden = false;
  contactPanel.setAttribute('aria-hidden', 'false');
  contactPanel.classList.remove('open');
  void contactPanel.offsetHeight;
  requestAnimationFrame(() => {
    contactPrevIcon = iconState;
    contactPanel.classList.add('open');
    toBackIcon();
    document.querySelector('.contact-btn')?.classList.add('active');
  });
}

function closeContactPanel(keepScroll = false) {
  if (!contactPanel) return;
  contactPanel.classList.remove('open');
  if (contactPrevIcon === 'plus') toPlusIcon();
  else if (contactPrevIcon === 'back') setBackIcon();
  contactPrevIcon = null;
  document.querySelector('.contact-btn')?.classList.remove('active');

  if (!keepScroll) {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }
}

aboutBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!aboutPanel) return;
  if (aboutPanel.classList.contains('open')) closeAboutPanel();
  else openAboutPanel();
});

contactBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!contactPanel) return;
  contactPanel.hidden = false;
  contactPanel.setAttribute('aria-hidden', 'false');
  if (contactPanel.classList.contains('open')) closeContactPanel();
  else openContactPanel();
});

// Zoom Button Logic (Global Listener)
// We need to re-evaluate 'grid' and 'layout' context on every click
zoomBtn.addEventListener("click", (e) => {
  // 1. Close panels if open
  if (
    (aboutPanel && (!aboutPanel.hidden || aboutPanel.classList.contains('open'))) ||
    (contactPanel && (!contactPanel.hidden || contactPanel.classList.contains('open')))
  ) {
    e.preventDefault();
    if (aboutPanel && (!aboutPanel.hidden || aboutPanel.classList.contains('open'))) closeAboutPanel();
    if (contactPanel && (!contactPanel.hidden || contactPanel.classList.contains('open'))) closeContactPanel();
    return;
  }

  // 2. If no grid or in item namespace (Item Page), go back
  const isItemPage = !document.getElementById("grid") ||
    (typeof barba !== 'undefined' && barba.history.current && barba.history.current.namespace === 'item');

  if (isItemPage) {
    e.preventDefault();
    if (typeof barba !== 'undefined') {
      barba.go('index.html');
    } else {
      window.location.href = 'index.html';
    }
    return;
  }

  // 3. Grid Layout Logic
  const isMobile = window.innerWidth <= 600;
  if (isMobile) {
    if (layout === 3) {
      layout = 1;
      toBackIcon();
    } else {
      layout = 3;
      toPlusIcon();
    }
  } else {
    if (layout === 5) {
      layout = 3;
      zoomDir = -1;
      setPlusIcon();
    } else if (layout === 3) {
      if (zoomDir === -1) {
        layout = 1;
        toBackIcon();
      } else {
        layout = 5;
        toPlusIcon();
      }
    } else {
      layout = 3;
      zoomDir = 1;
      setBackIcon();
    }
  }
  updateLayout(layout);
});

// Resize Listener
let lastWidth = window.innerWidth;

window.addEventListener("resize", () => {
  if (!document.getElementById("grid")) return;

  const currentWidth = window.innerWidth;
  // Ignore vertical resize (address bar show/hide on mobile)
  if (currentWidth === lastWidth) return;

  lastWidth = currentWidth;

  const width = document.getElementById("grid").clientWidth;
  const newLayout = pickLayoutByWidth(width);

  // Only auto-switch if we are NOT in a manual override state on mobile
  // But since we don't track "manual override" explicitly, 
  // simply preventing vertical resize updates solves the main "scroll" issue.
  // If width actually changes (rotation), we probably DO want to recalculate.

  if (newLayout !== layout) {
    layout = newLayout;
  }
  updateLayout(layout);
});

// 아이템 페이지 헤더 스크롤 핸들러
function initItemHeaderScroll(container) {
  const hero = container.querySelector('.hero');
  if (!hero) return;

  let lastScrollY = 0;
  const header = document.querySelector('header');

  hero.addEventListener('scroll', () => {
    // Skip header hide on mobile
    if (window.innerWidth <= 600) return;

    const currentScrollY = hero.scrollTop;

    // iOS 바운스 효과 등으로 인한 음수 스크롤 무시
    if (currentScrollY < 0) return;

    if (currentScrollY > lastScrollY && currentScrollY > 50) {
      // 아래로 스크롤 시 헤더 숨김
      header.style.transform = 'translateY(-100%)';
    } else if (currentScrollY < lastScrollY) {
      // 위로 스크롤 시 헤더 표시
      header.style.transform = 'translateY(0)';
    }
    lastScrollY = currentScrollY;
  }, { passive: true });
}


// =============================================================================
// BARBA.JS + GSAP INITIALIZATION
// =============================================================================

// Prevent browser's automatic scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Global hook for memory cleanup & interaction lock
barba.hooks.before((data) => {
  // 2. Memory Leak Fix: Kill all GSAP tweens and ScrollTriggers
  gsap.killTweensOf("*");
  if (typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.getAll().forEach(t => t.kill());
  }

  // 5. Animation Lock: Disable pointer events globally
  document.body.style.pointerEvents = 'none';
  isAnimating = true;

  // 2. Additional cleanup for window listeners (Issue 2)
  const oldMockup = data.current.container?.querySelector('#draggableMockup');
  if (oldMockup && oldMockup._resizeHandler) {
    window.removeEventListener('resize', oldMockup._resizeHandler);
  }
});

barba.hooks.after(() => {
  // 5. Animation Lock: Re-enable pointer events
  document.body.style.pointerEvents = '';
  isAnimating = false;

  // Global safety reset
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  const header = document.querySelector('header');
  if (header) header.style.marginRight = '';
});

barba.init({
  sync: true,
  debug: false,
  preventRunning: true,
  transitions: [
    {
      name: 'hero-transition',
      from: { namespace: 'home' },
      to: { namespace: 'item' },
      sync: true,
      leave(data) {
        // 4. Capture scroll position as the VERY first thing (Issue 4)
        savedScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

        // Disable interactions during animation
        isAnimating = true;
        const zoomBtn = document.getElementById('zoomBtn');
        if (zoomBtn) zoomBtn.style.pointerEvents = 'none';

        // Lock scroll context
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        document.body.classList.add('hero-scroll-disable');

        // Lock the current container in place visually so we can reset scroll immediately
        gsap.set(data.current.container, {
          position: 'fixed',
          top: -savedScrollY + 'px',
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          zIndex: 0
        });

        // Animate index elements out (Logo, Nav, Grid Items) - Exclude ZoomBtn
        const container = data.current.container;
        const logo = document.querySelector('header .logo');
        const nav = document.querySelector('header .site-nav');
        const items = container.querySelectorAll('.item');
        const isMobile = window.innerWidth <= 600;

        const tl = gsap.timeline();

        // Fade out grid items
        tl.to(items, { opacity: 0, duration: 0.4, stagger: 0.02 });

        // Slide up nav buttons & fade out logo (keep logo on mobile)
        if (isMobile) {
          // Mobile: slide up nav only
          tl.to(nav, { y: -300, opacity: 0, duration: 0.6, ease: "power2.in" }, "<");
        } else {
          // Desktop: fade logo, slide up nav
          tl.to(logo, { opacity: 0, duration: 0.4 }, "<");
          tl.to(nav, { y: -300, opacity: 0, duration: 0.6, ease: "power2.in" }, "<");
        }

        return tl;
      },
      enter(data) {
        // Reset scroll immediately since we locked the previous container
        window.scrollTo(0, 0);

        // Temporarily disable smooth scroll to ensure instant restoration
        document.documentElement.style.scrollBehavior = 'auto';

        const nextContainer = data.next.container;

        // --- NEW: Reset hero scroll and hide mockup as early as possible ---
        const isMobileTransition = window.innerWidth <= 600;
        const hero = nextContainer.querySelector('.hero');
        const mockup = nextContainer.querySelector('#draggableMockup');

        if (mockup) {
          if (isMobileTransition) {
            gsap.set(mockup, { display: 'none' });
          } else {
            gsap.set(mockup, { opacity: 0 });
          }
        }
        if (hero) {
          hero.scrollLeft = 0;
          // Reinforce on next frames to fight browser scroll restoration
          requestAnimationFrame(() => { if (hero) hero.scrollLeft = 0; });
          setTimeout(() => { if (hero) hero.scrollLeft = 0; }, 50);
        }
        // -------------------------------------------------------------------

        // Helper to get scrollbar width
        const getScrollbarWidth = () => window.innerWidth - document.documentElement.clientWidth;
        const scrollbarWidth = getScrollbarWidth();

        // Disable all scroll during animation & compensate for scrollbar
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        if (scrollbarWidth > 0) {
          document.body.style.paddingRight = `${scrollbarWidth}px`;
          const header = document.querySelector('header');
          if (header) header.style.marginRight = `${scrollbarWidth}px`;
        }

        // Disable hero scroll during animation
        if (hero) {
          hero.style.overflow = 'hidden';
          hero.style.scrollSnapType = 'none'; // Prevent snapping interference
        }

        // Identify item ID from data-id attribute
        const nextItemId = nextContainer.getAttribute('data-id');

        // Ensure the new container overlaps the old one
        // Use FIXED position to keep it in the viewport regardless of current scroll
        // Hide immediately to prevent flicker before animation
        gsap.set(nextContainer, {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%', // Ensure it covers the screen
          zIndex: 1,
          opacity: 0, // Hide immediately to prevent flicker
          overflowY: 'hidden'
        });

        // Select main hero content, excluding mockup
        const targetImg = nextContainer.querySelector('.hero > img:not(#draggableMockup)') ||
          nextContainer.querySelector('.hero > video') ||
          nextContainer.querySelector('.hero img:not(#draggableMockup)');

        // Fallback if no active item or target image
        if (!activeItem || !targetImg) {
          const tl = gsap.timeline({
            onComplete: () => {
              isAnimating = false;
              gsap.set(nextContainer, { clearProps: "all" });
            }
          });
          gsap.set(nextContainer, { opacity: 0 });
          tl.to(nextContainer, { opacity: 1, duration: 0.5 });

          // Fallback에서도 item-text 애니메이션 적용
          const itemText = nextContainer.querySelector('.item-text');
          if (itemText) {
            const isMobileAnim = window.innerWidth <= 600;
            if (isMobileAnim) {
              // 모바일: fromTo 사용 (opacity 0->1, y 50->0)
              tl.fromTo(itemText,
                { opacity: 0, y: 50 },
                { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
                "<0.2"
              );
            } else {
              // 데스크톱: from 사용 (CSS의 translateY(25vh)를 유지하며 y: 300에서 시작)
              tl.from(itemText, { y: 300, duration: 0.6, ease: "power2.out" }, "<0.2");
            }
          }
          return tl;
        }

        // Use pre-created clone
        const clone = transitionClone;
        if (clone) {
          clone.style.opacity = '1'; // Make it visible
        } else {
          // Fallback if clone wasn't created (shouldn't happen)
          const tl = gsap.timeline({
            onComplete: () => {
              isAnimating = false;
              gsap.set(nextContainer, { clearProps: "all" });
            }
          });
          gsap.set(nextContainer, { opacity: 0 });
          tl.to(nextContainer, { opacity: 1, duration: 0.5 });

          // Fallback에서도 item-text 애니메이션 적용
          const itemText = nextContainer.querySelector('.item-text');
          if (itemText) {
            const isMobileAnim = window.innerWidth <= 600;
            if (isMobileAnim) {
              // 모바일: fromTo 사용 (opacity 0->1, y 50->0)
              tl.fromTo(itemText,
                { opacity: 0, y: 50 },
                { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
                "<0.2"
              );
            } else {
              // 데스크톱: from 사용 (CSS의 translateY(25vh)를 유지하며 y: 300에서 시작)
              tl.from(itemText, { y: 300, duration: 0.6, ease: "power2.out" }, "<0.2");
            }
          }
          return tl;
        }

        // Hide the real target image initially
        gsap.set(targetImg, { opacity: 0 });

        // Use Promise to wait for image load and layout update
        return new Promise(resolve => {
          const runAnimation = () => {
            // Wait for layout to update
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // Final safety scroll reset before measuring
                if (hero) hero.scrollLeft = 0;

                // Force layout recalculation by reading dimensions
                void targetImg.offsetHeight;
                void targetImg.offsetWidth;

                let endRect = targetImg.getBoundingClientRect();



                const tl = gsap.timeline({
                  onComplete: () => {
                    activeItem = null;

                    // 2. Reset container to normal flow (scroll is already 0)
                    // Instead of clearProps, force explicit styles to prevent iOS rendering issues
                    // But respect mobile layout (fixed) vs desktop (relative)
                    const isMobile = window.innerWidth <= 600;

                    gsap.set(nextContainer, {
                      position: isMobile ? 'fixed' : 'relative',
                      opacity: 1,
                      zIndex: 1,
                      top: isMobile ? 0 : 'auto',
                      left: isMobile ? 0 : 'auto',
                      width: '100%',
                      height: isMobile ? '100%' : 'auto',
                      overflow: isMobile ? 'hidden' : 'visible',
                      clearProps: "transform"
                    });

                    // Force redraw
                    void nextContainer.offsetHeight;

                    // 4. Re-enable interactions
                    isAnimating = false;
                    document.documentElement.style.overflow = 'auto';
                    document.body.style.overflow = 'auto';
                    document.body.style.paddingRight = '';
                    document.documentElement.style.scrollBehavior = ''; // Restore smooth scroll
                    const header = document.querySelector('header');
                    if (header) header.style.marginRight = '';

                    const zoomBtn = document.getElementById('zoomBtn');
                    if (zoomBtn) zoomBtn.style.pointerEvents = 'auto';

                    const heroSection = nextContainer.querySelector('.hero');
                    if (heroSection) {
                      heroSection.style.overflow = 'auto';
                      heroSection.style.scrollSnapType = ''; // Restore snap
                    }

                    const itemText = nextContainer.querySelector('.item-text');
                    if (itemText) gsap.set(itemText, { clearProps: "all" });

                    // Restore mockup (make it exist in layout again)
                    if (mockup) {
                      if (isMobileTransition) {
                        gsap.set(mockup, { display: 'block' });
                      } else {
                        gsap.to(mockup, { opacity: 1, duration: 0.4 });
                      }
                    }

                    // 5. Show target and remove clone atomically
                    gsap.set(targetImg, { opacity: 1 });

                    // 비디오인 경우 애니메이션 완료 후 재생 시작
                    if (targetImg.tagName === 'VIDEO') {
                      targetImg.play().catch(() => { });
                    }

                    // Use requestAnimationFrame to ensure the target is painted before removing clone
                    requestAnimationFrame(() => {
                      clone.remove();
                      resolve();
                    });
                  }
                });

                // Animate the clone to the new position/size
                tl.to(clone, {
                  top: endRect.top,
                  left: endRect.left,
                  width: endRect.width,
                  height: endRect.height,
                  duration: 0.8,
                  ease: "power4.inOut"
                });

                // Fade in the rest of the new container (explicitly from 0 to 1)
                gsap.set(nextContainer, { opacity: 0 });
                tl.to(nextContainer, { opacity: 1, duration: 0.4 }, "<0.2");

                // Animate item text slide up
                const itemText = nextContainer.querySelector('.item-text');
                if (itemText) {
                  const isMobileAnim = window.innerWidth <= 600;
                  if (isMobileAnim) {
                    // 모바일: fromTo 사용
                    tl.fromTo(itemText,
                      { opacity: 0, y: 50 },
                      { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
                      "<"
                    );
                  } else {
                    // 데스크톱: from 사용 (CSS값 25vh를 최종값으로 인식)
                    tl.from(itemText, { y: 300, duration: 0.6, ease: "power2.out" }, "<");
                  }
                }
              });
            });
          };

          // Prevent double execution and ensure layout stability (fixes "weird" PC behavior)
          let didRun = false;
          const trigger = () => {
            if (didRun) return;
            didRun = true;
            runAnimation();
          };

          targetImg.onload = trigger;
          // Mobile (KakaoTalk) needs more time for layout; PC can be faster.
          setTimeout(trigger, isMobileTransition ? 150 : 20);
          if (targetImg.complete) trigger();
        });
      }
    },
    {
      name: 'hero-return',
      from: { namespace: 'item' },
      to: { namespace: 'home' },
      sync: true,
      leave(data) {
        // Disable interactions during animation
        isAnimating = true;
        const zoomBtn = document.getElementById('zoomBtn');
        if (zoomBtn) zoomBtn.style.pointerEvents = 'none';

        const heroSection = data.current.container.querySelector('.hero');
        if (heroSection) heroSection.style.overflow = 'hidden';

        // Make current container absolute so next container can take flow
        gsap.set(data.current.container, {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          zIndex: 1
        });

        const tl = gsap.timeline();

        // item-text 애니메이션
        const itemText = data.current.container.querySelector('.item-text');
        if (itemText) {
          const isMobile = window.innerWidth <= 600;
          if (isMobile) {
            // 모바일: opacity만
            tl.to(itemText, { opacity: 0, duration: 0.4, ease: "power2.in" });
          } else {
            // 데스크톱: 슬라이드 다운
            tl.to(itemText, { y: 300, duration: 0.4, ease: "power2.in" });
          }
        }

        // 컨테이너 페이드 아웃
        tl.to(data.current.container, { opacity: 0, duration: 0.4 }, "<0.1");

        return tl;
      },
      enter(data) {
        const nextContainer = data.next.container;

        // Temporarily disable smooth scroll to ensure instant restoration
        document.documentElement.style.scrollBehavior = 'auto';

        // Helper to get scrollbar width
        const getScrollbarWidth = () => window.innerWidth - document.documentElement.clientWidth;
        const scrollbarWidth = getScrollbarWidth();

        // Find the image/video on the item page (source), excluding mockup
        const sourceImg = data.current.container.querySelector('.hero > img:not(#draggableMockup)') ||
          data.current.container.querySelector('.hero > video') ||
          data.current.container.querySelector('.hero img:not(#draggableMockup)');

        // Find the target item ID from the container's data-id attribute
        const itemId = data.current.container.getAttribute('data-id');

        // Find the target image in the grid (인덱스에서는 모두 이미지)
        let targetItem = null;
        if (itemId) {
          targetItem = nextContainer.querySelector(`.item[data-id="${itemId}"] img`);
        }

        if (!sourceImg || !targetItem) {
          return gsap.to(nextContainer, {
            opacity: 1,
            duration: 0.5,
            onComplete: () => {
              isAnimating = false;
              gsap.set(nextContainer, { clearProps: "all" });
            }
          });
        }

        const startRect = sourceImg.getBoundingClientRect();

        // 비디오인 경우 정지하고 이미지 클론 사용 (poster와 동일한 이미지)
        let clone;
        if (sourceImg.tagName === 'VIDEO') {
          sourceImg.pause();
          // poster 이미지를 클론으로 사용
          clone = document.createElement('img');
          clone.src = sourceImg.poster || 'assets/Drink promo.webp';
        } else {
          clone = sourceImg.cloneNode(true);
        }

        clone.style.cssText = `
          position: fixed;
          top: ${startRect.top}px;
          left: ${startRect.left}px;
          width: ${startRect.width}px;
          height: ${startRect.height}px;
          z-index: 9999;
          object-fit: contain;
          background-color: transparent;
          transition: none;
          transform: translateZ(0);
          margin: 0;
          pointer-events: none;
          opacity: 1;
          will-change: top, left, width, height;
          backface-visibility: hidden;
        `;
        document.body.appendChild(clone);

        // Hide source and target
        gsap.set(sourceImg, { opacity: 0 });
        gsap.set(targetItem, { opacity: 0 });

        // Disable all scroll during animation & compensate for scrollbar
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        if (scrollbarWidth > 0) {
          document.body.style.paddingRight = `${scrollbarWidth}px`;
          const header = document.querySelector('header');
          if (header) header.style.marginRight = `${scrollbarWidth}px`;
        }

        // Disable hero scroll during animation
        const heroSection = nextContainer.querySelector('.hero');
        if (heroSection) heroSection.style.overflow = 'hidden';

        // DO NOT make nextContainer absolute. Let it be static to restore document height.
        // Just ensure it's visible (opacity might be 0 from default CSS?)
        // gsap.set(nextContainer, { opacity: 1 }); // It should be 1 by default or handled by CSS

        // Use Promise to wait for scroll restoration and layout update
        return new Promise(resolve => {
          // Restore scroll before calculating end position
          if (savedScrollY > 0) {
            document.body.scrollTop = savedScrollY;
            document.documentElement.scrollTop = savedScrollY;
            window.scrollTo(0, savedScrollY);
          }

          // Wait for layout to update
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Force grid update to match current viewport state (with padding correction)
              initGrid();

              let endRect = targetItem.getBoundingClientRect();

              const tl = gsap.timeline({
                onComplete: () => {
                  // 비디오 클론인 경우 정지 (아이템4에서 돌아올 때)
                  if (clone.tagName === 'VIDEO') {
                    clone.pause();
                  }

                  gsap.set(nextContainer, { clearProps: "position,top,left,width,zIndex" });

                  // Restore scroll after clearProps resets it
                  if (savedScrollY > 0) {
                    const scrollTarget = savedScrollY;
                    document.body.scrollTop = scrollTarget;
                    document.documentElement.scrollTop = scrollTarget;
                    window.scrollTo(0, scrollTarget);
                    savedScrollY = 0;
                  }

                  // Force grid update again after restoring scrollbar to ensure final alignment
                  initGrid();

                  // Show target atomically before removing clone
                  gsap.set(targetItem, { opacity: 1 });

                  // Use requestAnimationFrame to ensure target is painted before removing clone
                  requestAnimationFrame(() => {
                    clone.remove();

                    // Re-enable interactions after clone is gone
                    isAnimating = false;
                    document.documentElement.style.overflow = 'auto';
                    document.body.style.overflow = 'auto';
                    document.body.style.paddingRight = '';
                    document.documentElement.style.scrollBehavior = '';

                    const header = document.querySelector('header');
                    if (header) header.style.marginRight = '';

                    const zoomBtn = document.getElementById('zoomBtn');
                    if (zoomBtn) zoomBtn.style.pointerEvents = 'auto';

                    const heroSec = nextContainer.querySelector('.hero');
                    if (heroSec) heroSec.style.overflow = 'auto';

                    resolve(); // Resolve promise when everything is done
                  });
                }
              });

              tl.to(clone, {
                top: endRect.top,
                left: endRect.left,
                width: endRect.width,
                height: endRect.height,
                duration: 0.8,
                ease: "power4.inOut"
              });

              // Fade in grid items and slide up header nav
              const logo = document.querySelector('header .logo');
              const nav = document.querySelector('header .site-nav');
              const items = nextContainer.querySelectorAll('.item');
              const isMobile = window.innerWidth <= 600;

              // Set initial states
              gsap.set(items, { opacity: 0 });

              if (isMobile) {
                // Mobile: slide nav from above (top to bottom)
                gsap.set(nav, { opacity: 0, y: -300 });
                tl.to(nav, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "<");
              } else {
                // Desktop: fade logo, slide nav from below
                gsap.set(logo, { opacity: 0 });
                gsap.set(nav, { opacity: 0, y: -300 });
                tl.to(logo, { opacity: 1, duration: 0.4 }, "<");
                tl.to(nav, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "<");
              }

              tl.to(items, { opacity: 1, duration: 0.4, stagger: 0.02 }, "<");
            });
          });
        });
      }
    },
    {
      name: 'default-fade',
      leave(data) {
        return gsap.to(data.current.container, { opacity: 0, duration: 0.3 });
      },
      enter(data) {
        return gsap.to(data.next.container, {
          opacity: 1,
          duration: 0.3,
          onComplete: () => {
            gsap.set(data.next.container, { clearProps: "all" });
          }
        });
      }
    }
  ],
  views: [
    {
      namespace: 'home',
      beforeEnter() {
        document.body.classList.remove('item-view');
        const isReturningFromItem = sessionStorage.getItem('navigatedToItem') === 'true';

        if (isReturningFromItem) {
          items = Array.from(document.querySelectorAll(".item"));
          items.forEach(item => item.classList.add('no-transition'));
          sessionStorage.removeItem('navigatedToItem');
        }

        initGrid();

        // 4. Robust scroll restoration (Issue 4)
        if (isReturningFromItem && savedScrollY > 0) {
          const scrollTarget = savedScrollY;

          const applyScroll = () => {
            document.body.scrollTop = scrollTarget;
            document.documentElement.scrollTop = scrollTarget;
            window.scrollTo(0, scrollTarget);
          };

          requestAnimationFrame(() => {
            applyScroll();
            requestAnimationFrame(() => {
              applyScroll();
              // Safety timeout to ensure grid layout is finished and painted
              setTimeout(applyScroll, 20);
              setTimeout(applyScroll, 60);
              savedScrollY = 0; // Reset after restoration
            });
          });
        }

        // Re-enable transitions
        if (isReturningFromItem) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              items.forEach(item => item.classList.remove('no-transition'));
            });
          });
        }
      },
      afterEnter() {
        updateZoomIcon();
      }
    },
    {
      namespace: 'item',
      beforeEnter() {
        setBackIcon();
        grid = null;
        sessionStorage.setItem('navigatedToItem', 'true');
      },
      afterEnter(data) {
        document.body.classList.add('item-view');
        // 아이템 페이지 헤더 스크롤 기능 활성화
        initItemHeaderScroll(data.next.container);

        // 비디오가 있는 경우 재생 시작 (새로고침 또는 직접 접근 시)
        const video = data.next.container.querySelector('.hero video');
        if (video) {
          video.play().catch(() => { });
        }
      }
    }
  ]
});

// --- Moved Safety net is now in barba.hooks.after above ---

// Initial check on first load
if (document.getElementById("grid")) {
  initGrid();
} else {
  setBackIcon();
}

// Forward scroll events to hero section on item pages
document.addEventListener('wheel', (e) => {
  // Don't scroll during Barba animations or Concertina animation
  if (isAnimating || (typeof concertinaAnimating !== 'undefined' && concertinaAnimating)) return;

  // Check for concertina wrapper first (item-3)
  const concertinaWrapper = document.querySelector('.concertina-sequence-wrapper');
  if (concertinaWrapper) {
    // Only allow scrolling if the concertina is expanded
    if (typeof isConcertinaExpanded === 'function' && isConcertinaExpanded()) {
      e.preventDefault();
      concertinaWrapper.scrollTop += e.deltaY;
    }
    return;
  }

  // Regular hero section for other items
  const heroSection = document.querySelector('main[data-barba-namespace="item"] .hero');
  if (heroSection) {
    e.preventDefault();
    heroSection.scrollTop += e.deltaY;
  }
}, { passive: false });

// Also block touch scrolling during animations on mobile
document.addEventListener('touchmove', (e) => {
  if (isAnimating || (typeof concertinaAnimating !== 'undefined' && concertinaAnimating)) {
    if (e.cancelable) e.preventDefault();
  }
}, { passive: false });

// Header Scroll Behavior (Hide on down, Show on up)
let lastScrollY = 0;

window.addEventListener('scroll', () => {
  // Skip header hide on mobile
  if (window.innerWidth <= 600) return;

  const header = document.querySelector('header');
  if (!header) return;

  const currentScrollY = window.scrollY || document.documentElement.scrollTop;

  // Simple hide/show logic
  if (currentScrollY > lastScrollY && currentScrollY > 50) {
    // Scrolling down -> Hide
    header.style.transform = 'translateY(-100%)';
  } else if (currentScrollY < lastScrollY) {
    // Scrolling up -> Show
    header.style.transform = 'translateY(0)';
  }

  lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
}, { passive: true });

// Reset header on page transition
barba.hooks.after(() => {
  const header = document.querySelector('header');
  if (header) {
    header.style.transform = 'translateY(0)';
  }

  // Item 2 페이지 스크롤텔링 초기화
  initBookSequences();
});

// =============================================================================
// BOOK SCROLL SEQUENCE (Item 2)
// =============================================================================

const bookFrameCount = 60;
let allBookFrames = null;

// 책별 설정 및 프레임 프리로드
function preloadBookFrames() {
  if (allBookFrames) return;

  const bookConfigs = [
    { folder: 'book_sequence_1', prefix: 'Book_1' },
    { folder: 'book_sequence_ 2', prefix: 'Book_1' },
    { folder: 'book_sequence_3', prefix: 'Book_3' }
  ];

  allBookFrames = bookConfigs.map(config => {
    const frames = [];
    for (let i = 1; i <= bookFrameCount; i++) {
      const img = new Image();
      img.src = `assets/${config.folder}/${config.prefix}${String(i).padStart(4, '0')}.webp`;
      frames.push(img);
    }
    return frames;
  });
}

// 스크롤텔링 초기화
function initBookSequences() {
  const heroSection = document.querySelector('.hero');
  const containers = document.querySelectorAll('.book-sequence-container');

  // item 페이지가 아니면 실행하지 않음
  if (!heroSection || containers.length === 0) return;

  // 프레임 프리로드
  preloadBookFrames();

  // ScrollTrigger 등록
  gsap.registerPlugin(ScrollTrigger);

  // 기존 ScrollTrigger 정리
  ScrollTrigger.getAll().forEach(st => st.kill());
  const isMobile = window.innerWidth <= 600;

  // 레이아웃 안정화 후 초기화
  setTimeout(() => {
    ScrollTrigger.refresh();

    containers.forEach((container, index) => {
      const stickyWrapper = container.querySelector('.book-sequence-sticky');
      const sequenceImg = container.querySelector('.book-sequence-img');
      const frames = allBookFrames[index];

      if (!stickyWrapper || !sequenceImg || !frames) return;

      // 모바일/데스크톱 공통: GSAP pin 사용
      // 모바일에서 content-wrapper의 overflow:hidden 때문에 sticky가 작동 안 하는 문제 해결

      // 이전 프레임 인덱스 추적 (동일 프레임 src 교체 방지)
      let currentFrameIndex = -1;

      if (isMobile) {
        // 모바일: Pin 없이 스크롤 진행에 따라 이미지만 교체 (덜덜거림 완전 제거)
        // 컨테이너가 자연스럽게 스크롤되면서 이미지가 회전
        ScrollTrigger.create({
          trigger: container,
          scroller: heroSection,
          start: "top top",      // 컨테이너 상단이 화면 상단에 도달하면 시작
          end: "bottom bottom",   // 컨테이너 하단이 화면 하단에 도달하면 종료
          scrub: true,
          onUpdate: (self) => {
            const frameIndex = Math.min(
              Math.floor(self.progress * bookFrameCount),
              bookFrameCount - 1
            );
            if (frameIndex !== currentFrameIndex && frames[frameIndex] && frames[frameIndex].complete) {
              sequenceImg.src = frames[frameIndex].src;
              currentFrameIndex = frameIndex;
            }
          }
        });
      } else {
        // 데스크톱: GSAP Pin 사용 (부드럽게 작동)
        ScrollTrigger.create({
          trigger: container,
          scroller: heroSection,
          pin: stickyWrapper,
          pinType: "transform",
          anticipatePin: 1,
          start: "center center",
          end: "+=200%",
          scrub: 0.5,
          fastScrollEnd: true,
          onUpdate: (self) => {
            const frameIndex = Math.min(
              Math.floor(self.progress * bookFrameCount),
              bookFrameCount - 1
            );
            if (frameIndex !== currentFrameIndex && frames[frameIndex] && frames[frameIndex].complete) {
              sequenceImg.src = frames[frameIndex].src;
              currentFrameIndex = frameIndex;
            }
          }
        });
      }
    });
  }, 100);
}

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initBookSequences();
  });
} else {
  initBookSequences();
}
// =============================================================================
// ITEM 3: CONCERTINA CLICK SEQUENCE ANIMATION (Simplified & Robust)
// =============================================================================

// State: false = folded, true = expanded
// Uses variable (not sessionStorage) so it resets on page refresh but persists during Barba navigations
// concertinaExpanded defined at top

// Simple state functions
function isConcertinaExpanded() {
  return concertinaExpanded;
}

function setConcertinaExpanded(expanded) {
  concertinaExpanded = expanded;
}

// Get current frame based on expanded state
function getConcertinaFrame() {
  return isConcertinaExpanded() ? CONCERTINA_FRAME_COUNT - 1 : 0;
}

// Preload all frames
function preloadConcertinaFrames() {
  if (concertinaFramesLoaded) return;
  concertinaFramesLoaded = true;

  for (let i = 0; i < CONCERTINA_FRAME_COUNT; i++) {
    const img = new Image();
    img.src = `assets/Concertina_sequence/Concertina${String(i).padStart(4, '0')}.webp`;
    concertinaFrames.push(img);
  }
}

// Set image to current state (no animation) - Desktop only
function setConcertinaImage(container = document) {
  // Skip on mobile
  if (window.innerWidth <= 600) return;

  const wrapper = container.querySelector('.concertina-sequence-wrapper');
  const img = container.querySelector('.concertina-sequence-img');
  if (!img || !wrapper) return;

  const expanded = isConcertinaExpanded();
  const frameIndex = getConcertinaFrame();
  img.src = `assets/Concertina_sequence/Concertina${String(frameIndex).padStart(4, '0')}.webp`;

  // Constants for margin calculations (desktop only)
  const vSpace = window.innerHeight;
  const v_a = vSpace - 144;
  const h_c = v_a * 1.4328;
  const marginFolded = h_c * -0.151;
  const marginExpanded = h_c * -0.0067;

  // Always reset scroll to top on entry
  wrapper.scrollTop = 0;

  if (!expanded) {
    wrapper.classList.remove('is-expanded');
    wrapper.style.overflowY = 'hidden';
    img.style.marginTop = marginFolded + 'px';
    img.style.marginBottom = marginFolded + 'px';
  } else {
    wrapper.classList.add('is-expanded');
    wrapper.style.overflowY = 'auto';
    img.style.marginTop = marginExpanded + 'px';
    img.style.marginBottom = marginExpanded + 'px';
  }
}

// Animate between states - Desktop only
function toggleConcertina() {
  // Skip on mobile (extra safety)
  if (window.innerWidth <= 600) return;
  if (concertinaAnimating) return;

  const wrapper = document.querySelector('.concertina-sequence-wrapper');
  const img = document.querySelector('.concertina-sequence-img');
  const header = document.querySelector('header');
  if (!img || !wrapper) return;

  preloadConcertinaFrames();

  const currentlyExpanded = isConcertinaExpanded();
  const startFrame = currentlyExpanded ? CONCERTINA_FRAME_COUNT - 1 : 0;
  const endFrame = currentlyExpanded ? 0 : CONCERTINA_FRAME_COUNT - 1;

  concertinaAnimating = true;

  // Constants for margin calculations (desktop only)
  const vSpace = window.innerHeight;
  const v_a = vSpace - 144;
  const h_c = v_a * 1.4328;
  const marginFolded = h_c * -0.151;
  const marginExpanded = h_c * -0.0067;

  // Calculate target scroll
  const h_v_e = h_c * (1894 / 1920);
  const totalH = h_v_e + 144;
  const targetScroll = Math.max(0, (totalH - vSpace) / 2);

  // Initial setup for expansion
  if (!currentlyExpanded && wrapper) {
    wrapper.style.overflowY = 'hidden';
    wrapper.classList.add('is-expanded');
  } else if (currentlyExpanded && wrapper) {
    wrapper.style.overflowY = 'hidden';
  }

  // Header animation
  if (header) {
    gsap.to(header, { y: currentlyExpanded ? '0%' : '-100%', duration: 0.4, ease: "power2.inOut" });
  }

  // Master Animation Object
  const animState = {
    frame: startFrame,
    scroll: currentlyExpanded ? wrapper.scrollTop : 0,
    margin: currentlyExpanded ? marginExpanded : marginFolded
  };

  gsap.to(animState, {
    frame: endFrame,
    scroll: currentlyExpanded ? 0 : targetScroll,
    margin: currentlyExpanded ? marginFolded : marginExpanded,
    duration: 1,
    ease: "power2.inOut",
    onUpdate: () => {
      // 1. Update image frame
      const f = Math.round(animState.frame);
      if (concertinaFrames[f] && concertinaFrames[f].complete) {
        img.src = concertinaFrames[f].src;
      }

      // 2. Update scroll position
      wrapper.scrollTop = animState.scroll;

      // 3. Update margins (crucial for jitter-free)
      img.style.marginTop = animState.margin + 'px';
      img.style.marginBottom = animState.margin + 'px';
    },
    onComplete: () => {
      const nextState = !currentlyExpanded;
      setConcertinaExpanded(nextState);
      concertinaAnimating = false;

      // Ensure final values
      img.src = `assets/Concertina_sequence/Concertina${String(endFrame).padStart(4, '0')}.webp`;

      if (nextState) {
        // Only enable scroll AFTER expansion completes
        wrapper.style.overflowY = 'auto';
      } else {
        wrapper.style.overflowY = 'hidden';
        wrapper.scrollTop = 0;
        wrapper.classList.remove('is-expanded');
      }
    }
  });
}

// Single global click handler (added only once)
let concertinaClickHandlerAdded = false;

function addConcertinaClickHandler() {
  if (concertinaClickHandlerAdded) return;
  concertinaClickHandlerAdded = true;

  document.addEventListener('click', (e) => {
    // Disable concertina toggle on mobile
    if (window.innerWidth <= 600) return;

    // Only work on item-3 page
    if (!document.querySelector('.concertina-interactive')) return;

    // Ignore buttons, links, nav, header
    if (e.target.closest('button, a, nav, header')) return;

    toggleConcertina();
  });
}

// Initialize Concertina on item-3 page
function initConcertinaSequence() {
  // Skip on mobile - concertina expand/collapse is disabled
  if (window.innerWidth <= 600) return;

  const concertinaWrapper = document.querySelector('.concertina-sequence-wrapper');
  if (!concertinaWrapper) return;

  // Preload frames
  preloadConcertinaFrames();

  // Set image to saved state
  setConcertinaImage();

  // Add click handler (only once)
  addConcertinaClickHandler();

  // Add header scroll handler (hide on scroll down, show on scroll up)
  let lastScrollY = 0;
  const header = document.querySelector('header');
  const heroElement = concertinaWrapper.closest('.hero');

  concertinaWrapper.addEventListener('scroll', () => {
    // Skip header hide on mobile
    if (window.innerWidth <= 600) return;

    const currentScrollY = concertinaWrapper.scrollTop;

    if (currentScrollY < 0) return;

    if (currentScrollY > lastScrollY && currentScrollY > 50) {
      // Scrolling down - hide header
      header.style.transform = 'translateY(-100%)';
    } else if (currentScrollY < lastScrollY) {
      // Scrolling up - show header
      header.style.transform = 'translateY(0)';
    }
    lastScrollY = currentScrollY;
  }, { passive: true });
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConcertinaSequence);
} else {
  initConcertinaSequence();
}

// Initialize on Barba transitions
// 1. BEFORE ENTER: Set correct state/scroll immediately so it doesn't flicker
barba.hooks.beforeEnter((data) => {
  // Skip on mobile
  if (window.innerWidth <= 600) return;

  // Only for item-3 page
  const wrapper = data.next.container.querySelector('.concertina-sequence-wrapper');
  if (wrapper) {
    // Reset scroll and setup state immediately before it shows
    setConcertinaImage(data.next.container);

    // Specifically handle header visibility if already expanded
    const header = document.querySelector('header');
    if (header && isConcertinaExpanded()) {
      gsap.set(header, { y: '-100%' });
    } else if (header) {
      gsap.set(header, { y: '0%' });
    }
  }
});

// 2. AFTER: Handle preloading and listeners
barba.hooks.after(() => {
  initConcertinaSequence();
});

// =============================================================================
// ITEM 3: DRAGGABLE MOCKUP LOGIC
// =============================================================================

function initDraggableMockup() {
  const mockup = document.getElementById('draggableMockup');
  const logo = document.querySelector('.item-logo');
  const itemText = document.querySelector('.item-text');

  if (!mockup || !logo) return;

  // Scale state for double-click functionality
  let scale = 1;

  // 1. Positioning: Align mockup left edge with item-text left edge
  function positionMockup() {
    const logoRect = logo.getBoundingClientRect();
    const headerHeight = 72;
    const gapAboveLogo = 72;

    // Calculate targeted height
    // Top is at header (72px)
    // Bottom is at (logo.top - 72px)
    const availableTop = headerHeight;
    const availableBottom = logoRect.top - gapAboveLogo;
    const targetHeight = availableBottom - availableTop;

    if (targetHeight < 50) return; // Safety check

    // Set height and top (Y position stays the same)
    mockup.style.height = `${targetHeight}px`;
    mockup.style.width = 'auto'; // Maintain aspect ratio
    mockup.style.top = `${availableTop}px`;

    // X position: Align mockup left edge with item-text left edge
    if (itemText) {
      const itemTextRect = itemText.getBoundingClientRect();
      mockup.style.left = `${itemTextRect.left}px`;
    } else {
      // Fallback: use logo positioning if itemText not found
      const mockupRect = mockup.getBoundingClientRect();
      const validLeft = logoRect.left - mockupRect.width;
      mockup.style.left = `${validLeft}px`;
    }

    // Show after positioning (prevent jump if it was hidden or default)
    mockup.style.visibility = 'visible';
  }

  // Set invisible initially to prevent jump
  if (!mockup.style.left) {
    mockup.style.visibility = 'hidden';
  }

  // Position after image loads
  if (mockup.complete) {
    positionMockup();
  } else {
    mockup.onload = positionMockup;
  }

  // 2. Memory Leak Fix: Use a named function for resize so we can remove it (Issue 2)
  const onMockupResize = () => positionMockup();
  window.addEventListener('resize', onMockupResize);

  // Store reference for Barba cleanup
  mockup._resizeHandler = onMockupResize;

  // Stop propagation on click to prevent Concertina activation
  mockup.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Double click to scale (expands towards bottom-right due to transform-origin: left top)
  mockup.addEventListener('dblclick', (e) => {
    e.stopPropagation();

    // Toggle scale
    scale = scale === 1 ? 1.75 : 1;
    mockup.style.transform = `scale(${scale})`;

    // Push logo away when zoomed in (Only for Item 3 where it overlaps)
    const isItem3 = document.querySelector('.concertina-sequence-wrapper');

    if (logo && isItem3) {
      if (scale > 1) {
        // Move logo down
        // Calculate target position: 72px below the expanded mockup
        const baseHeight = mockup.offsetHeight;
        const expandedBottom = 72 + (baseHeight * 1.75); // Top(72) + Height * Scale
        const gap = 72;
        const targetTop = expandedBottom + gap;

        // Calculate shift relative to viewport center (where top:50% anchors)
        const logoHeight = logo.offsetHeight;
        const viewportCenter = window.innerHeight / 2;
        const targetCenter = targetTop + (logoHeight / 2);
        const shiftY = targetCenter - viewportCenter;

        logo.style.transform = `translateY(calc(-50% + ${shiftY}px))`;
      } else {
        // Reset logo position
        logo.style.transform = `translateY(-50%)`;
      }
    }
  });
}

// Mobile swipe gallery indicator
function initMobileSwipeGallery() {
  const isMobile = window.innerWidth <= 600;
  if (!isMobile) return;

  const hero = document.querySelector('.hero.poster-hero, .hero.video-hero, .hero.concertina-interactive');
  if (!hero) return;

  // Always reset scroll to first slide on page entry (even if already initialized)
  hero.scrollLeft = 0;

  // Update indicator dots to reflect first slide
  const contentWrapper = hero.closest('.content-wrapper');
  const indicator = contentWrapper?.querySelector('.swipe-indicator');
  if (indicator) {
    const dots = indicator.querySelectorAll('.dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === 0);
    });
  }

  // Prevent multiple scroll listener attachments
  if (hero._swipeGalleryInit) return;
  hero._swipeGalleryInit = true;

  if (!indicator) return;

  const dots = indicator.querySelectorAll('.dot');
  if (dots.length < 2) return;

  let currentSlide = 0;

  // Symmetrical update logic
  const updateIndicator = () => {
    const scrollLeft = hero.scrollLeft;
    const maxScroll = hero.scrollWidth - hero.clientWidth;

    if (maxScroll <= 0) return;

    // Use total scroll progress to determine slide index (perfectly symmetrical)
    const progress = scrollLeft / maxScroll;
    const newSlide = Math.round(progress * (dots.length - 1));

    if (newSlide !== currentSlide) {
      currentSlide = newSlide;
      dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
      });
    }
  };

  hero.addEventListener('scroll', updateIndicator, { passive: true });
}

// Init on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      initMobileSwipeGallery();
    } else {
      initDraggableMockup();
    }
  });
} else {
  const isMobile = window.innerWidth <= 600;
  if (isMobile) {
    initMobileSwipeGallery();
  } else {
    initDraggableMockup();
  }
}

// Init on Barba transition
// Desktop: Use beforeEnter to position mockup before animation starts
barba.hooks.beforeEnter((data) => {
  if (data.next.namespace === 'item') {
    const isMobile = window.innerWidth <= 600;
    if (!isMobile) {
      initDraggableMockup();
    }
  }
});

// Mobile: Use after hook to ensure animation is complete before resetting scroll
barba.hooks.after((data) => {
  if (data.next.namespace === 'item') {
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      setTimeout(() => {
        initMobileSwipeGallery();
        const hero = document.querySelector('.hero.poster-hero, .hero.video-hero, .hero.concertina-interactive');
        if (hero) {
          hero.scrollLeft = 0;
        }
      }, 100);
    }
  }
});
