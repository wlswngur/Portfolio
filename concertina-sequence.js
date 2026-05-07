(() => {
  const FRAME_COUNT = 61;
  const MOBILE_BREAKPOINT = 600;
  const FOLDED_CROP = 0.151;
  const EXPANDED_CROP = 0.0067;
  const FOLDED_VISIBLE_RATIO = 1 - (FOLDED_CROP * 2);

  let frames = [];
  let framesPromise = null;
  let framesReady = false;
  let animating = false;
  let expanded = false;
  let clickHandlerAdded = false;

  function isExpanded() {
    return expanded;
  }

  function isAnimating() {
    return animating;
  }

  function setExpanded(nextExpanded) {
    expanded = nextExpanded;
  }

  function getFrame() {
    return isExpanded() ? FRAME_COUNT - 1 : 0;
  }

  function getFrameSrc(frameIndex) {
    return `assets/Concertina_sequence/Concertina${String(frameIndex).padStart(4, '0')}.webp`;
  }

  function getThumbnailSrc() {
    return getFrameSrc(getFrame());
  }

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function getMobileMetrics(wrapper) {
    const wrapperHeight = wrapper.clientHeight || (window.innerHeight - 48);
    const imageHeight = wrapperHeight / FOLDED_VISIBLE_RATIO;
    const yFolded = imageHeight * -FOLDED_CROP;
    const yExpanded = imageHeight * -EXPANDED_CROP;
    const targetScroll = Math.max(0, (imageHeight - wrapperHeight) / 2);

    return {
      imageHeight,
      yFolded,
      yExpanded,
      targetScroll
    };
  }

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

  function preloadFrames() {
    if (framesPromise) return framesPromise;

    frames = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.src = getFrameSrc(i);
      frames.push(img);
    }

    framesPromise = Promise.all(frames.map(waitForImageReady)).then(() => {
      framesReady = true;
      return frames;
    });

    return framesPromise;
  }

  function schedulePreload() {
    if (framesPromise) return;

    const run = () => {
      preloadFrames();
    };

    if ('requestAnimationFrame' in window) {
      window.requestAnimationFrame(() => {
        setTimeout(run, 0);
      });
    } else {
      setTimeout(run, 0);
    }
  }

  function setMobileImage(container = document) {
    const wrapper = container.querySelector('.concertina-sequence-wrapper');
    const img = container.querySelector('.concertina-sequence-img');
    if (!img || !wrapper) return;

    const currentExpanded = isExpanded();
    const metrics = getMobileMetrics(wrapper);
    const y = currentExpanded ? metrics.yExpanded : metrics.yFolded;

    img.src = getFrameSrc(getFrame());
    img.style.height = `${metrics.imageHeight}px`;
    img.style.marginTop = '';
    img.style.marginBottom = '';
    img.style.transform = `translate3d(0, ${y}px, 0)`;

    wrapper.classList.toggle('is-expanded', currentExpanded);
    wrapper.style.overflowY = currentExpanded ? 'auto' : 'hidden';
    wrapper.scrollTop = currentExpanded ? metrics.targetScroll : 0;
  }

  function setImage(container = document) {
    if (isMobile()) {
      setMobileImage(container);
      return;
    }

    const wrapper = container.querySelector('.concertina-sequence-wrapper');
    const img = container.querySelector('.concertina-sequence-img');
    if (!img || !wrapper) return;

    const currentExpanded = isExpanded();
    const vSpace = window.innerHeight;
    const vA = vSpace - 144;
    const hC = vA * 1.4328;
    const marginFolded = hC * -0.151;
    const marginExpanded = hC * -0.0067;

    img.src = getFrameSrc(getFrame());
    img.style.height = '';
    img.style.transform = '';
    wrapper.scrollTop = 0;

    if (!currentExpanded) {
      wrapper.classList.remove('is-expanded');
      wrapper.style.overflowY = 'hidden';
      img.style.marginTop = `${marginFolded}px`;
      img.style.marginBottom = `${marginFolded}px`;
      return;
    }

    wrapper.classList.add('is-expanded');
    wrapper.style.overflowY = 'auto';
    img.style.marginTop = `${marginExpanded}px`;
    img.style.marginBottom = `${marginExpanded}px`;
  }

  function updateFrame(img, frameIndex, lastFrame) {
    if (frameIndex === lastFrame) return lastFrame;
    const frame = frames[frameIndex];
    if (!frame || !frame.complete) return lastFrame;

    img.src = frame.src;
    return frameIndex;
  }

  function toggleMobile() {
    if (animating || typeof gsap === 'undefined') return;

    const wrapper = document.querySelector('.concertina-sequence-wrapper');
    const img = document.querySelector('.concertina-sequence-img');
    if (!img || !wrapper) return;

    const currentlyExpanded = isExpanded();
    animating = true;

    const play = () => {
      const startFrame = currentlyExpanded ? FRAME_COUNT - 1 : 0;
      const endFrame = currentlyExpanded ? 0 : FRAME_COUNT - 1;
      const metrics = getMobileMetrics(wrapper);
      let lastFrame = startFrame;

      wrapper.classList.remove('is-preparing');
      wrapper.style.overflowY = 'hidden';
      wrapper.classList.add('is-expanded');
      img.style.height = `${metrics.imageHeight}px`;
      img.style.marginTop = '';
      img.style.marginBottom = '';

      const animState = {
        frame: startFrame,
        scroll: currentlyExpanded ? wrapper.scrollTop : 0,
        y: currentlyExpanded ? metrics.yExpanded : metrics.yFolded
      };

      gsap.killTweensOf(animState);
      gsap.to(animState, {
        frame: endFrame,
        scroll: currentlyExpanded ? 0 : metrics.targetScroll,
        y: currentlyExpanded ? metrics.yFolded : metrics.yExpanded,
        duration: 0.82,
        ease: 'power2.inOut',
        onUpdate: () => {
          lastFrame = updateFrame(img, Math.round(animState.frame), lastFrame);
          wrapper.scrollTop = animState.scroll;
          img.style.transform = `translate3d(0, ${animState.y}px, 0)`;
        },
        onComplete: () => {
          const nextState = !currentlyExpanded;
          setExpanded(nextState);
          animating = false;

          img.src = getFrameSrc(endFrame);
          img.style.transform = `translate3d(0, ${nextState ? metrics.yExpanded : metrics.yFolded}px, 0)`;

          if (nextState) {
            wrapper.classList.add('is-expanded');
            wrapper.style.overflowY = 'auto';
            wrapper.scrollTop = metrics.targetScroll;
          } else {
            wrapper.classList.remove('is-expanded');
            wrapper.style.overflowY = 'hidden';
            wrapper.scrollTop = 0;
          }
        }
      });
    };

    if (!framesReady) {
      wrapper.classList.add('is-preparing');
    }

    preloadFrames()
      .then(play)
      .catch(() => {
        animating = false;
        wrapper.classList.remove('is-preparing');
      });
  }

  function toggle() {
    if (isMobile()) {
      toggleMobile();
      return;
    }

    if (animating || typeof gsap === 'undefined') return;

    const wrapper = document.querySelector('.concertina-sequence-wrapper');
    const img = document.querySelector('.concertina-sequence-img');
    const header = document.querySelector('header');
    if (!img || !wrapper) return;

    preloadFrames();

    const currentlyExpanded = isExpanded();
    const startFrame = currentlyExpanded ? FRAME_COUNT - 1 : 0;
    const endFrame = currentlyExpanded ? 0 : FRAME_COUNT - 1;
    const vSpace = window.innerHeight;
    const vA = vSpace - 144;
    const hC = vA * 1.4328;
    const marginFolded = hC * -0.151;
    const marginExpanded = hC * -0.0067;
    const hVE = hC * (1894 / 1920);
    const totalH = hVE + 144;
    const targetScroll = Math.max(0, (totalH - vSpace) / 2);

    let lastFrame = startFrame;
    animating = true;

    wrapper.style.overflowY = 'hidden';
    if (!currentlyExpanded) {
      wrapper.classList.add('is-expanded');
    }

    if (header) {
      gsap.to(header, {
        y: currentlyExpanded ? '0%' : '-100%',
        duration: 0.4,
        ease: 'power2.inOut'
      });
    }

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
      ease: 'power2.inOut',
      onUpdate: () => {
        lastFrame = updateFrame(img, Math.round(animState.frame), lastFrame);
        wrapper.scrollTop = animState.scroll;
        img.style.marginTop = `${animState.margin}px`;
        img.style.marginBottom = `${animState.margin}px`;
      },
      onComplete: () => {
        const nextState = !currentlyExpanded;
        setExpanded(nextState);
        animating = false;
        img.src = getFrameSrc(endFrame);

        if (nextState) {
          wrapper.style.overflowY = 'auto';
        } else {
          wrapper.style.overflowY = 'hidden';
          wrapper.scrollTop = 0;
          wrapper.classList.remove('is-expanded');
        }
      }
    });
  }

  function addClickHandler() {
    if (clickHandlerAdded) return;
    clickHandlerAdded = true;

    document.addEventListener('click', (event) => {
      if (isMobile()) return;
      if (!document.querySelector('.concertina-interactive')) return;
      if (event.target.closest('button, a, nav, header')) return;

      toggle();
    });
  }

  function addMobileTapHandler(wrapper) {
    if (wrapper._mobileConcertinaTapInit) return;
    wrapper._mobileConcertinaTapInit = true;

    let tapStart = null;

    wrapper.addEventListener('pointerdown', (event) => {
      if (!isMobile() || animating) return;

      const hero = wrapper.closest('.hero');
      tapStart = {
        x: event.clientX,
        y: event.clientY,
        scrollTop: wrapper.scrollTop,
        heroScrollLeft: hero ? hero.scrollLeft : 0
      };
    }, { passive: true });

    wrapper.addEventListener('pointerup', (event) => {
      if (!tapStart || !isMobile() || animating) {
        tapStart = null;
        return;
      }

      const hero = wrapper.closest('.hero');
      const dx = Math.abs(event.clientX - tapStart.x);
      const dy = Math.abs(event.clientY - tapStart.y);
      const didVerticalScroll = Math.abs(wrapper.scrollTop - tapStart.scrollTop) > 4;
      const didHorizontalSwipe = hero && Math.abs(hero.scrollLeft - tapStart.heroScrollLeft) > 4;

      tapStart = null;

      if (dx <= 12 && dy <= 12 && !didVerticalScroll && !didHorizontalSwipe) {
        toggle();
      }
    }, { passive: true });

    wrapper.addEventListener('pointercancel', () => {
      tapStart = null;
    }, { passive: true });
  }

  function init() {
    const wrapper = document.querySelector('.concertina-sequence-wrapper');
    if (!wrapper) return;

    schedulePreload();
    setImage();

    if (isMobile()) {
      addMobileTapHandler(wrapper);
      return;
    }

    addClickHandler();

    if (wrapper._desktopConcertinaScrollInit) return;
    wrapper._desktopConcertinaScrollInit = true;

    let lastScrollY = 0;
    wrapper.addEventListener('scroll', () => {
      if (isMobile()) return;

      const header = document.querySelector('header');
      if (!header) return;

      const currentScrollY = wrapper.scrollTop;
      if (currentScrollY < 0) return;

      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        header.style.transform = 'translateY(-100%)';
      } else if (currentScrollY < lastScrollY) {
        header.style.transform = 'translateY(0)';
      }

      lastScrollY = currentScrollY;
    }, { passive: true });
  }

  function beforeEnter(data) {
    const wrapper = data.next.container.querySelector('.concertina-sequence-wrapper');
    if (!wrapper) return;

    setImage(data.next.container);

    const header = document.querySelector('header');
    if (!header || typeof gsap === 'undefined') return;

    if (!isMobile() && isExpanded()) {
      gsap.set(header, { y: '-100%' });
    } else {
      gsap.set(header, { y: '0%' });
    }
  }

  window.PortfolioConcertina = {
    beforeEnter,
    getFrameCount: () => FRAME_COUNT,
    getThumbnailSrc,
    init,
    isAnimating,
    isExpanded,
    preload: preloadFrames,
    toggle
  };
})();
