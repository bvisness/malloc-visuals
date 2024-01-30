class StructDef {
    constructor(size, fields) {
        this.size = size;
        this.fields = fields;
    }

    static newFromC(name, fieldNames) {
        return new StructDef(
            Module.ccall(`sizeof_${name}`),
            fieldNames.map(fieldName => ({
                name: fieldName,
                size: Module.ccall(`sizeof_${name}_${fieldName}`),
                offset: Module.ccall(`offsetof_${name}_${fieldName}`),
            })),
        );
    }

    /**
     * @param {Uint8Array} mem 
     * @param {number} addr
     */
    load(mem, addr) {
        const res = { __addr: addr };
        for (const field of this.fields) {
            // Little endian is assumed
            let num = 0;
            for (let i = 0; i < field.size; i++) {
                num |= mem[addr + field.offset + i] << (i * 8);
            }
            res[field.name] = num;
        }
        return res;
    }

    /**
     * @param {Uint8Array} mem 
     * @param {number} addr 
     * @param {number} len 
     */
    loadArray(mem, addr, len) {
        const res = [];
        for (let i = 0; i < len; i++) {
            res.push(this.load(mem, addr + i * this.size));
        }
        return res;
    }
}

function load(mem, addr, size) {
    let num = 0;
    for (let i = 0; i < size; i++) {
        num |= mem[addr + i] << (i * 8);
    }
    return num;
}

function load8(mem, addr) {
    return mem[addr];
}

function load16(mem, addr) {
    return load(mem, addr, 2);
}

function load32(mem, addr) {
    return load(mem, addr, 4);
}

function load64(mem, addr) {
    return load(mem, addr, 8);
}
