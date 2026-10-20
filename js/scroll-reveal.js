(() => {
  const selectors = [
    '.editorial-section-head','.topic-card','.editorial-post-list > article',
    '.test-info-grid > div','.author-card','.about-content > section',
    '.principle-grid > div','.doctor-profile','.signal-grid > div'
  ];
  const nodes = document.querySelectorAll(selectors.join(','));
  nodes.forEach((el, i) => {
    el.classList.add('reveal-on-scroll');
    if (i % 3 === 1) el.classList.add('reveal-delay-1');
    if (i % 3 === 2) el.classList.add('reveal-delay-2');
  });
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
  nodes.forEach(el => observer.observe(el));
})();
