'use strict';

(function exposeTimelineScroll(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  root.RelayDockTimelineScroll = api;
})(typeof globalThis === 'object' ? globalThis : this, function createTimelineScrollApi() {
  const DEFAULT_BOTTOM_THRESHOLD = 48;

  function captureTimelineScroll(element, threshold = DEFAULT_BOTTOM_THRESHOLD) {
    if (!element) return null;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return {
      scrollTop: element.scrollTop,
      followBottom: distanceFromBottom <= threshold
    };
  }

  function restoreTimelineScroll(element, snapshot, options = {}) {
    if (!element || !snapshot) return;
    element.scrollTop = options.forceBottom || snapshot.followBottom
      ? element.scrollHeight
      : snapshot.scrollTop;
  }

  return {
    DEFAULT_BOTTOM_THRESHOLD,
    captureTimelineScroll,
    restoreTimelineScroll
  };
});
