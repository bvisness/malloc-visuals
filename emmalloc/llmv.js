// dom.ts
function N(v) {
  if (typeof v === "string") {
    return document.createTextNode(v);
  }
  return v;
}
function addChildren(n, children) {
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child) {
        n.appendChild(N(child));
      }
    }
  } else {
    if (children) {
      n.appendChild(N(children));
    }
  }
}
function E(type, classes, children) {
  const el = document.createElement(type);
  if (classes && classes.length > 0) {
    const actualClasses = classes.filter((c) => !!c);
    el.classList.add(...actualClasses);
  }
  if (children) {
    addChildren(el, children);
  }
  return el;
}
function F(children) {
  const f = document.createDocumentFragment();
  addChildren(f, children);
  return f;
}

// llmv.ts
var LLMV = class {
  /**
   * px per byte
   */
  zoom;
  constructor() {
    this.zoom = 24;
  }
  renderTape(tape) {
    let maxBars = 1;
    for (const region of tape.regions) {
      if (region.bars && region.bars.length > maxBars) {
        maxBars = region.bars.length;
      }
    }
    const elTape = E("div", ["llmv-tape"]);
    for (const region of tape.regions) {
      const elRegion = E("div", ["llmv-region"], [
        // region address
        E("div", ["llmv-code", "llmv-f3", "llmv-c2", "llmv-flex", "llmv-flex-column", "llmv-justify-end", "llmv-pl1", "llmv-pb1"], [
          Hex(region.addr)
        ])
      ]);
      const elFields = E("div", ["llmv-region-fields"]);
      for (const field of this.pad(region.addr, region.size, region.fields)) {
        const elField = E("div", ["llmv-field", "llmv-flex", "llmv-flex-column", "llmv-tc"]);
        elField.style.width = this.width(field.size);
        if (Array.isArray(field.content)) {
          const elSubfields = E("div", ["llmv-flex"]);
          for (const subfield of this.pad(field.addr, field.size, field.content)) {
            if (Array.isArray(subfield.content)) {
              throw new Error("can't have sub-sub-fields");
            }
            elSubfields.appendChild(FieldContent(subfield.content, "llmv-subfield"));
          }
          elField.appendChild(elSubfields);
        } else {
          elField.appendChild(FieldContent(field.content));
        }
        if (field.name) {
          let name = field.name;
          if (typeof name === "string") {
            name = name.trim() || "\xA0";
          }
          elField.appendChild(E("div", ["llmv-bt", "llmv-b2", "llmv-c2", "llmv-pa1", "llmv-f3"], name));
        }
        elFields.appendChild(elField);
      }
      elRegion.appendChild(elFields);
      const bars = [...region.bars ?? []];
      while (bars.length < maxBars) {
        bars.push({ addr: 0, size: 0 });
      }
      const elBars = E("div", ["llmv-flex", "llmv-flex-column"], bars.map((bar) => {
        const elBar = E("div", ["llmv-bar"]);
        elBar.style.marginLeft = this.width(bar.addr - region.addr);
        elBar.style.width = this.width(bar.size);
        if (bar.color) {
          elBar.style.backgroundColor = bar.color;
        }
        return elBar;
      }));
      elRegion.appendChild(elBars);
      elRegion.appendChild(E("div", ["llmv-f3", "llmv-tc"], region.description));
      elTape.appendChild(elRegion);
    }
    return elTape;
  }
  width(size) {
    return `${size * this.zoom}px`;
  }
  pad(baseAddr, size, fields) {
    const res = [];
    let lastAddr = baseAddr;
    for (const field of fields) {
      if (lastAddr < field.addr) {
        res.push({
          addr: lastAddr,
          size: field.addr - lastAddr,
          content: Padding()
        });
      }
      res.push(field);
      lastAddr = field.addr + field.size;
    }
    if (lastAddr < baseAddr + size) {
      res.push({
        addr: lastAddr,
        size: baseAddr + size - lastAddr,
        content: Padding()
      });
    }
    return res;
  }
};
function Padding() {
  return E("div", ["llmv-flex-grow-1", "llmv-striped"]);
}
function FieldContent(content, klass) {
  const classes = [klass, "llmv-flex-grow-1", "llmv-flex", "llmv-flex-column", "llmv-code", "llmv-f2"];
  if (typeof content === "string") {
    classes.push("llmv-pa1");
    return E("div", classes, [
      content
    ]);
  }
  return E("div", classes, content);
}
function Byte(n) {
  return Hex(n, false);
}
function Hex(n, prefix = true) {
  return `${prefix ? "0x" : ""}${n.toString(16)}`;
}
export {
  Byte,
  E,
  F,
  Hex,
  LLMV,
  N,
  Padding,
  addChildren
};
