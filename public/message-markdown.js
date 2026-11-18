'use strict';

// Studio 时间线只在显示时把模型回复转成 HTML。原文仍留在账本里。
// 所有文本先转义，再套我们自己的标签，避免回复里的 HTML 被执行。

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text) {
  let html = '';
  let rest = String(text);
  while (rest) {
    const code = rest.match(/^`([^`]+)`/);
    const bold = rest.match(/^\*\*([^*]+)\*\*/);
    if (code) {
      html += '<code>' + escapeHtml(code[1]) + '</code>';
      rest = rest.slice(code[0].length);
      continue;
    }
    if (bold) {
      html += '<strong>' + escapeHtml(bold[1]) + '</strong>';
      rest = rest.slice(bold[0].length);
      continue;
    }
    const next = rest.search(/[`*]/);
    if (next <= 0) {
      html += escapeHtml(next === 0 ? rest[0] : rest);
      rest = next === 0 ? rest.slice(1) : '';
      continue;
    }
    html += escapeHtml(rest.slice(0, next));
    rest = rest.slice(next);
  }
  return html;
}

function isBlockStart(line) {
  return /^```/.test(line) || /^#{1,3}\s+\S/.test(line) || /^[-*]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line);
}

function renderMessageMarkdown(value) {
  const text = value == null ? '' : String(value).replace(/\r\n/g, '\n');
  if (!text.trim()) return '';
  const lines = text.split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^```[\w-]*\s*$/);
    if (fence) {
      const body = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push('<pre><code>' + escapeHtml(body.join('\n')) + '</code></pre>');
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push('<h' + level + '>' + renderInline(heading[2].trim()) + '</h' + level + '>');
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push('<li>' + renderInline(lines[index].replace(/^[-*]\s+/, '')) + '</li>');
        index += 1;
      }
      blocks.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push('<li>' + renderInline(lines[index].replace(/^\d+\.\s+/, '')) + '</li>');
        index += 1;
      }
      blocks.push('<ol>' + items.join('') + '</ol>');
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(renderInline(lines[index]));
      index += 1;
    }
    blocks.push('<p>' + paragraph.join('<br>') + '</p>');
  }

  return blocks.join('');
}

if (typeof module === 'object' && module.exports) {
  module.exports = { renderMessageMarkdown };
}
