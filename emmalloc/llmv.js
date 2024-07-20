/**
 * @typedef Tape
 * @type {object}
 * @property {Region} [preRegion]
 * @property {Region[]} regions
 * @property {Region} [postRegion]
 */

/**
 * @typedef Region
 * @type {object}
 * @property {number} addr
 * @property {number} size
 * @property {Field[]} fields
 * @property {Bar[]} [bars]
 * @property {BNodes} [description]
 */

/**
 * @typedef Field
 * @type {object}
 * @property {number} addr
 * @property {number} size
 * @property {BNodes} [name]
 * @property {BNodes} [tag]
 * @property {(BNode|Field[])} content
 */

/**
 * @typedef Bar
 * @type {object}
 * @property {number} addr
 * @property {number} size
 * @property {string} [color]
 */

/**
 * @typedef Thing
 * @type {object}
 * @property {number} addr
 * @property {number} size
 */

class LLMV {
    constructor() {
        /**
         * @type {number}
         */
        this.zoom = 24; // px per byte
    }

    /**
     * @param {Tape} tape 
     */
    renderTape(tape) {
        // TODO: preRegion

        let maxBars = 1;
        for (const region of tape.regions) {
            if (region.bars?.length > maxBars) {
                maxBars = region.bars.length;
            } 
        }

        const elTape = E("div", ["tape", "flex", "flex-wrap"]);
        for (const region of tape.regions) {
            const elRegion = E("div", ["region"], [
                // region address
                E("div", ["code", "f7", "white-60", "flex", "flex-column", "justify-end", "pl1", "pb1"], [
                    hex(region.addr),
                ]),
            ]);

            const elFields = E("div", ["region-fields"]);
            for (const field of this.pad(region.addr, region.size, region.fields)) {
                // TODO: Check if addresses are overlapping and warn.

                const elField = E("div", ["field", "flex", "flex-column", "tc"]);
                elField.style.width = this.width(field.size);

                if (Array.isArray(field.content)) {
                    const elSubfields = E("div", ["flex"]);
                    for (const subfield of this.pad(field.addr, field.size, field.content)) {
                        if (Array.isArray(subfield.content)) {
                            throw new Error("can't have sub-sub-fields");
                        }
                        elSubfields.appendChild(FieldContent(subfield.content, "subfield"));
                    }
                    elField.appendChild(elSubfields);
                } else {
                    elField.appendChild(FieldContent(field.content));
                }

                if (field.name) {
                    elField.appendChild(E("div", ["bt", "b--white-60", "white-60", "pa1", "f7"], field.name));
                }

                elFields.appendChild(elField);
            }
            elRegion.appendChild(elFields);

            const bars = [...region.bars ?? []];
            while (bars.length < maxBars) {
                bars.push({ addr: 0, size: 0 });
            }
            const elBars = E("div", ["flex", "flex-column"], bars.map(bar => {
                const elBar = E("div", ["h--bar"]);
                elBar.style.marginLeft = this.width(bar.addr - region.addr);
                elBar.style.width = this.width(bar.size);
                if (bar.color) {
                    elBar.style.backgroundColor = bar.color;
                }
                return elBar;
            }));
            elRegion.appendChild(elBars);

            elRegion.appendChild(E("div", ["f7", "tc"], region.description));

            elTape.appendChild(elRegion);
        }

        // TODO: postRegion

        return elTape;
    }

    /**
     * @param {number} size 
     * @returns {string}
     */
    width(size) {
        return `${size * this.zoom}px`;
    }

    /**
     * @param {number} baseAddr 
     * @param {number} size 
     * @param {Field[]} fields 
     * @returns {Field[]}
     */
    pad(baseAddr, size, fields) {
        /** @type {Field[]} */
        const res = [];

        let lastAddr = baseAddr;
        for (const field of fields) {
            if (lastAddr < field.addr) {
                res.push({
                    addr: lastAddr,
                    size: field.addr - lastAddr,
                    content: Padding(),
                });
            }
            res.push(field);
            lastAddr = field.addr + field.size;
        }
        if (lastAddr < baseAddr + size) {
            res.push({
                addr: lastAddr,
                size: baseAddr + size - lastAddr,
                content: Padding(),
            });
        }

        return res;
    }

}

function Padding() {
    return E("div", ["flex-grow-1", "striped"]);
}

/**
 * @param {BNode} content 
 * @returns 
 */
function FieldContent(content, klass = null) {
    if (typeof content === "string") {
        return E("div", [klass, "flex-grow-1", "pa1", "flex", "flex-column", "code", "f6"], [
            content,
        ]);
    }
    return E("div", [klass, "flex-grow-1", "flex", "flex-column", "code", "f6"], content);
}
