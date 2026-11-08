export function measureScrollFrames({ scroll = true } = {}) {
  return new Promise((resolveDone) => {
    const region = document.querySelector(".grid-scroll"),
      frames = [];
    let previous, start;
    function frame(now) {
      if (previous !== undefined) frames.push(now - previous);
      else start = now;
      previous = now;
      if (scroll) {
        region.scrollTop =
          ((now - start) / 5000) * (region.scrollHeight - region.clientHeight);
        region.scrollLeft =
          ((now - start) / 5000) * (region.scrollWidth - region.clientWidth);
      }
      if (now - start < 5000) requestAnimationFrame(frame);
      else resolveDone(frames);
    }
    requestAnimationFrame(frame);
  });
}
