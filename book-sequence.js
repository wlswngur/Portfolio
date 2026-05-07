(() => {
  const FRAME_COUNT = 60;
  const MOBILE_BREAKPOINT = 600;
  const SCROLL_TRIGGER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';
  const BOOK_CONFIGS = [
    { folder: 'book_sequence_1', prefix: 'Book_1' },
    { folder: 'book_sequence_ 2', prefix: 'Book_1' },
    { folder: 'book_sequence_3', prefix: 'Book_3' }
  ];

  let allFrames = null;
  let framesPromise = null;
  let framesReady = false;
  let initToken = 0;
  let scrollTriggerPromise = null;

  function waitForImageReady(img) {
    if (!img) return Promise.resolve();

    const loadPromise = img.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

    return loadPromise.then(() => {
      if (img.naturalWidth && img.decode) {
        return img.decode().catch(() => { });
      }
    });
  }

  function ensureScrollTrigger() {
    if (typeof ScrollTrigger !== 'undefined') {
      return Promise.resolve(ScrollTrigger);
    }

    if (scrollTriggerPromise) return scrollTriggerPromise;

    scrollTriggerPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="ScrollTrigger.min.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.ScrollTrigger), { once: true });
        existingScript.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = SCROLL_TRIGGER_SRC;
      script.async = true;
      script.onload = () => resolve(window.ScrollTrigger);
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return scrollTriggerPromise;
  }

  function preloadFrames() {
    if (framesPromise) return framesPromise;

    if (!allFrames) {
      allFrames = BOOK_CONFIGS.map((config) => {
        const frames = [];
        for (let i = 1; i <= FRAME_COUNT; i++) {
          const img = new Image();
          img.decoding = 'async';
          img.src = `assets/${config.folder}/${config.prefix}${String(i).padStart(4, '0')}.webp`;
          frames.push(img);
        }
        return frames;
      });
    }

    const readiness = [];
    allFrames.forEach((frames) => {
      frames.forEach((img) => {
        readiness.push(waitForImageReady(img));
      });
    });

    framesPromise = Promise.all(readiness).then(() => {
      framesReady = true;
      return allFrames;
    });

    return framesPromise;
  }

  function updateFrame(sequenceImg, frames, frameIndex, currentFrameIndex) {
    if (frameIndex === currentFrameIndex) return currentFrameIndex;
    const frame = frames[frameIndex];
    if (!frame || !frame.complete) return currentFrameIndex;

    sequenceImg.src = frame.src;
    return frameIndex;
  }

  function createSequenceTrigger(ScrollTriggerPlugin, heroSection, container, frames, isMobile) {
    const stickyWrapper = container.querySelector('.book-sequence-sticky');
    const sequenceImg = container.querySelector('.book-sequence-img');
    if (!stickyWrapper || !sequenceImg || !frames || !framesReady) return;

    let currentFrameIndex = -1;

    if (isMobile) {
      ScrollTriggerPlugin.create({
        trigger: container,
        scroller: heroSection,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: (self) => {
          const frameIndex = Math.min(
            Math.floor(self.progress * FRAME_COUNT),
            FRAME_COUNT - 1
          );
          currentFrameIndex = updateFrame(sequenceImg, frames, frameIndex, currentFrameIndex);
        }
      });
      return;
    }

    ScrollTriggerPlugin.create({
      trigger: container,
      scroller: heroSection,
      pin: stickyWrapper,
      pinType: 'transform',
      anticipatePin: 1,
      start: 'center center',
      end: '+=200%',
      scrub: 0.5,
      fastScrollEnd: true,
      onUpdate: (self) => {
        const frameIndex = Math.min(
          Math.floor(self.progress * FRAME_COUNT),
          FRAME_COUNT - 1
        );
        currentFrameIndex = updateFrame(sequenceImg, frames, frameIndex, currentFrameIndex);
      }
    });
  }

  function cancelPendingInit() {
    initToken += 1;
  }

  function init() {
    const heroSection = document.querySelector('.hero');
    const containers = document.querySelectorAll('.book-sequence-container');
    if (!heroSection || containers.length === 0 || typeof gsap === 'undefined') return;

    const currentToken = ++initToken;

    ensureScrollTrigger()
      .then((ScrollTriggerPlugin) => {
        if (!ScrollTriggerPlugin || currentToken !== initToken || !heroSection.isConnected) return null;
        return preloadFrames().then((framesByBook) => ({ ScrollTriggerPlugin, framesByBook }));
      })
      .then((setup) => {
        if (!setup || currentToken !== initToken || !heroSection.isConnected) return;

        const { ScrollTriggerPlugin, framesByBook } = setup;
        gsap.registerPlugin(ScrollTriggerPlugin);
        ScrollTriggerPlugin.getAll().forEach((st) => st.kill());

        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        setTimeout(() => {
          if (currentToken !== initToken || !heroSection.isConnected) return;

          ScrollTriggerPlugin.refresh();
          containers.forEach((container, index) => {
            if (!container.isConnected) return;
            createSequenceTrigger(
              ScrollTriggerPlugin,
              heroSection,
              container,
              framesByBook[index],
              isMobile
            );
          });
        }, 100);
      })
      .catch(() => { });
  }

  window.PortfolioBookSequence = {
    cancelPendingInit,
    init,
    preload: preloadFrames
  };
})();
