'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_BOTTOM_THRESHOLD,
  captureTimelineScroll,
  restoreTimelineScroll
} = require('../public/timeline-scroll');

test('timeline scroll capture distinguishes history browsing from the latest messages', () => {
  assert.deepEqual(
    captureTimelineScroll({ scrollTop: 120, clientHeight: 300, scrollHeight: 900 }),
    { scrollTop: 120, followBottom: false }
  );
  assert.deepEqual(
    captureTimelineScroll({ scrollTop: 570, clientHeight: 300, scrollHeight: 900 }),
    { scrollTop: 570, followBottom: true }
  );
  assert.equal(DEFAULT_BOTTOM_THRESHOLD, 48);
});

test('timeline scroll restore keeps a history reader in place after a refresh', () => {
  const timeline = { scrollTop: 120, clientHeight: 300, scrollHeight: 900 };
  const snapshot = captureTimelineScroll(timeline);

  timeline.scrollTop = 0;
  timeline.scrollHeight = 1100;
  restoreTimelineScroll(timeline, snapshot);

  assert.equal(timeline.scrollTop, 120);
});

test('timeline scroll restore follows new messages when already near the bottom or explicitly requested', () => {
  const timeline = { scrollTop: 570, clientHeight: 300, scrollHeight: 900 };
  const nearBottom = captureTimelineScroll(timeline);
  timeline.scrollTop = 0;
  timeline.scrollHeight = 1100;
  restoreTimelineScroll(timeline, nearBottom);
  assert.equal(timeline.scrollTop, 1100);

  const readingHistory = { scrollTop: 120, followBottom: false };
  timeline.scrollTop = 0;
  restoreTimelineScroll(timeline, readingHistory, { forceBottom: true });
  assert.equal(timeline.scrollTop, 1100);
});
