'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMessageMarkdown } = require('../public/message-markdown');

test('message markdown renders headings, lists, emphasis, and code', () => {
  const html = renderMessageMarkdown([
    '## 结论',
    '失败原因有两个：',
    '',
    '- 测试没跑过',
    '- `login()` 少返回了状态',
    '',
    '请看 **状态码**。',
    '',
    '```js',
    'return { ok: false }',
    '```'
  ].join('\n'));

  assert.match(html, /<h2>结论<\/h2>/);
  assert.match(html, /<p>失败原因有两个：<\/p>/);
  assert.match(html, /<ul><li>测试没跑过<\/li><li><code>login\(\)<\/code> 少返回了状态<\/li><\/ul>/);
  assert.match(html, /<p>请看 <strong>状态码<\/strong>。<\/p>/);
  assert.match(html, /<pre><code>return \{ ok: false \}<\/code><\/pre>/);
});

test('message markdown escapes raw HTML instead of executing it', () => {
  const html = renderMessageMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('message markdown keeps plain line breaks and blank input empty', () => {
  assert.equal(renderMessageMarkdown(''), '');
  assert.equal(renderMessageMarkdown(null), '');
  assert.equal(renderMessageMarkdown('第一行\n第二行'), '<p>第一行<br>第二行</p>');
});
