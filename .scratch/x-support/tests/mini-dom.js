'use strict';
/**
 * 极简 DOM：够跑 querySelector / closest / matches，供提取与观察单测使用。
 * 只实现本仓库适配器实际用到的选择器形态。
 */

function parseSimple(sel) {
  const s = String(sel).trim();
  const out = { tag: null, attrs: [], classes: [] };
  let rest = s;
  const tagM = rest.match(/^[a-zA-Z][\w-]*/);
  if (tagM) {
    out.tag = tagM[0].toLowerCase();
    rest = rest.slice(tagM[0].length);
  }
  const attrRe = /\[([^\]]+)\]/g;
  let am;
  while ((am = attrRe.exec(s))) {
    const raw = am[1];
    const eq = raw.match(/^([^\t\n*$|^~=]+)(\*=|\^=|=)"([^"]*)"$/);
    if (eq) out.attrs.push({ name: eq[1], op: eq[2], value: eq[3] });
    else out.attrs.push({ name: raw, op: 'exists', value: '' });
  }
  const classRe = /\.([A-Za-z][\w-]*)/g;
  let cm;
  while ((cm = classRe.exec(s))) out.classes.push(cm[1]);
  return out;
}

function attrMatch(node, spec) {
  const v = node.getAttribute(spec.name);
  if (spec.op === 'exists') return v != null;
  if (v == null) return false;
  if (spec.op === '=') return v === spec.value;
  if (spec.op === '*=') return v.includes(spec.value);
  if (spec.op === '^=') return v.startsWith(spec.value);
  return false;
}

class MiniNode {
  constructor(tag, attrs, children) {
    this.tagName = tag === '#text' ? '#TEXT' : String(tag).toUpperCase();
    this.attrs = { ...(attrs || {}) };
    this.childNodes = [];
    this.parentNode = null;
    this.parentElement = null;
    this._text = '';
    if (typeof children === 'string') {
      this._text = children;
    } else {
      for (const c of children || []) this.appendChild(c);
    }
  }

  appendChild(child) {
    if (typeof child === 'string') child = new MiniNode('#text', {}, child);
    child.parentNode = this;
    child.parentElement = this.tagName === '#TEXT' ? this.parentElement : this;
    this.childNodes.push(child);
    return child;
  }

  get textContent() {
    if (this.tagName === '#TEXT') return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this.childNodes = [];
    this._text = '';
    if (this.tagName === '#TEXT') this._text = String(v);
    else if (v) this.appendChild(String(v));
  }

  get innerText() {
    return this.textContent;
  }

  get classList() {
    const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
    return { contains: (c) => set.has(c) };
  }

  getAttribute(name) {
    if (!(name in this.attrs)) return null;
    return String(this.attrs[name]);
  }

  matches(sel) {
    if (this.tagName === '#TEXT' || this.tagName === '#DOCUMENT') return false;
    const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
    return parts.some((part) => {
      const spec = parseSimple(part);
      if (spec.tag && spec.tag !== this.tagName.toLowerCase()) return false;
      for (const a of spec.attrs) if (!attrMatch(this, a)) return false;
      for (const c of spec.classes) if (!this.classList.contains(c)) return false;
      return true;
    });
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => {
      if (n !== this && n.tagName !== '#TEXT' && n.matches(sel)) out.push(n);
      for (const c of n.childNodes) walk(c);
    };
    walk(this);
    return out;
  }

  closest(sel) {
    let n = this;
    while (n && n.tagName !== '#DOCUMENT') {
      if (n.tagName !== '#TEXT' && n.matches(sel)) return n;
      n = n.parentElement;
    }
    return null;
  }
}

function el(tag, attrs, ...children) {
  const node = new MiniNode(tag, attrs, []);
  for (const c of children.flat()) {
    if (c == null) continue;
    node.appendChild(c);
  }
  return node;
}

function documentOf(...children) {
  const doc = new MiniNode('#document', {}, []);
  const body = el('body', {});
  doc.appendChild(body);
  for (const c of children) body.appendChild(c);
  doc.body = body;
  doc.querySelector = (s) => body.querySelector(s);
  doc.querySelectorAll = (s) => body.querySelectorAll(s);
  return doc;
}

module.exports = { el, documentOf, MiniNode };
