const grid = document.getElementById("grid");
const zoomBtn = document.getElementById("zoomBtn");
const items = Array.from(document.querySelectorAll(".item"));
const plusEl = document.querySelector('#zoomBtn .plus');
const backEl = document.querySelector('#zoomBtn .back');

// Gaps and minimum acceptable item widths per layout
const GAP_MAP  = { 1: 28, 3: 24, 5: 20 };
const MIN_ITEM = { 1: 280, 3: 220, 5: 180 };

// Compute item width for a given grid width and column count
function calcItemWidth(gridWidth, columns) {
  const gap = GAP_MAP[columns];
  return Math.floor((gridWidth - gap * (columns - 1)) / columns);
}

// Pick the most dense layout that still meets the minimum item width
function pickLayoutByWidth(gridWidth) {
  const isMobile = window.innerWidth <= 600;

  if (!isMobile) {
    // 데스크탑: 5 → 3 → 1
    const w5 = calcItemWidth(gridWidth, 5);
    if (w5 >= MIN_ITEM[5]) return 5;

    const w3 = calcItemWidth(gridWidth, 3);
    if (w3 >= MIN_ITEM[3]) return 3;

    return 1;
  } else {
    // 모바일: 3 → 1 (5칸 생략)
    const w3 = calcItemWidth(gridWidth, 3);
    if (w3 >= MIN_ITEM[3]) return 3;

    return 1;
  }
}

function layoutPositions(columns) {
  const positions = [];

  const gridWidth = grid.clientWidth;
  const gap = GAP_MAP[columns];

  // Item size adapts to available width (can vary with viewport)
  let itemWidth = calcItemWidth(gridWidth, columns);

  // When zoomed to 1 column, also cap by viewport height so the tile fully fits under the header
  if (columns === 1) {
    const HEADER_H = 72;      // fixed header height
    const SAFE_VPAD = 48;     // small breathing room below header
    const maxByHeight = Math.floor(window.innerHeight - HEADER_H - SAFE_VPAD);
    itemWidth = Math.min(itemWidth, maxByHeight);
  }

  // Center horizontally only (equal left/right margins), keep Y from top (no vertical centering)
  const contentWidth = columns * itemWidth + gap * (columns - 1);
  const offsetX = Math.max(0, Math.floor((gridWidth - contentWidth) / 2));

  items.forEach((_, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);

    const x = offsetX + col * (itemWidth + gap);
    const y = row * (itemWidth + gap); // top-aligned; do not modify Y origin

    positions.push({ x, y, size: itemWidth });
  });

  // Update container height so page can scroll
  const rows = Math.ceil(items.length / columns);
  const gridHeight = rows * itemWidth + (rows - 1) * gap;
  grid.style.height = `${gridHeight}px`;

  return positions;
}

function applyPositions(positions) {
  items.forEach((item, i) => {
    const { x, y, size } = positions[i];

    item.style.width = `${size}px`;
    item.style.height = `${size}px`;

    // 위치를 CSS 변수로만 갱신 (인라인 transition/transform 설정 안 함)
    item.style.setProperty('--tx', `${x}px`);
    item.style.setProperty('--ty', `${y}px`);
  });
}

function updateLayout(columns) {
  const positions = layoutPositions(columns);
  applyPositions(positions);

  // 👇 레이아웃별 hover 스케일 세팅 (원하는 수치로 조절)
  const hoverScale = columns === 5 ? 1.02 : columns === 3 ? 1.015 : 1.0075; // 1칸일 땐 꺼버림(=1.0)
  grid.style.setProperty('--hover-scale', hoverScale);
}

layout = (window.innerWidth <= 600) ? 1 : pickLayoutByWidth(grid.clientWidth);
// 초기 상태
updateLayout(layout);

// ✅ GSAP 아이콘 초기 설정 (레이아웃에 따라 다름)
if (layout === 1) {
  // 모바일(1칸) 시작: < 보이기, + 숨기기
  gsap.set(plusEl, { opacity: 0, y: -6, rotate: 6, scale: 0.96 });
  gsap.set(backEl, { opacity: 1, y: 0, rotate: 0, scale: 1 });
} else {
  // 데스크탑 시작: + 보이기, < 숨기기
  gsap.set(plusEl, { opacity: 1, y: 0, rotate: 0, scale: 1 });
  gsap.set(backEl, { opacity: 0, y: 6, rotate: -6, scale: 0.96 });
}

// 버튼 클릭 이벤트
zoomBtn.addEventListener("click", () => {
  const isMobile = window.innerWidth <= 600;

  if (!isMobile && layout === 5) {
    // 5 → 3 (데스크탑 전용 경로)
    layout = 3;
    gsap.to(plusEl, { opacity: 1, y: 0, rotate: 0, scale: 1, duration: 0.25, ease: "power2.out" });
    gsap.to(backEl, { opacity: 0, y: 6, rotate: -6, scale: 0.96, duration: 0.25, ease: "power2.out" });

  } else if (layout === 3) {
    // 3 → 1 (모바일/데스크탑 공통)
    layout = 1;
    gsap.to(plusEl, { opacity: 0, y: -6, rotate: 6, scale: 0.96, duration: 0.28, ease: "power2.inOut" });
    gsap.fromTo(backEl,
      { opacity: 0, y: 6, rotate: -6, scale: 0.96 },
      { opacity: 1, y: 0, rotate: 0, scale: 1.04, duration: 0.36, ease: "power2.inOut",
        onComplete() {
          gsap.to(backEl, { scale: 1, duration: 0.12, ease: "power1.out" });
        }
      }
    );

  } else {
    // 1 → (모바일:3) / (데스크탑:5)
    const target = isMobile ? 3 : 5;
    layout = target;
    // back 숨기고 plus 보이기 (1→3 또는 1→5 동일 애니메이션)
    gsap.to(backEl, { opacity: 0, y: 6, rotate: -6, scale: 0.96, duration: 0.28, ease: "power2.inOut" });
    gsap.fromTo(plusEl,
      { opacity: 0, y: -6, rotate: 6, scale: 0.96 },
      { opacity: 1, y: 0, rotate: 0, scale: 1.02, duration: 0.32, ease: "power2.inOut",
        onComplete() {
          gsap.to(plusEl, { scale: 1, duration: 0.1, ease: "power1.out" });
        }
      }
    );
  }

  updateLayout(layout);
});

// ✅ 창 크기에 따라 자동으로 레이아웃 변경
window.addEventListener("resize", () => {
  const width = grid.clientWidth;
  const newLayout = pickLayoutByWidth(width);
  if (newLayout !== layout) {
    layout = newLayout;
  }
  updateLayout(layout);
});