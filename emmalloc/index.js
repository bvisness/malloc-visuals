const BYTE_WIDTH_REM = 1.25;
const MAX_WIDTH_REM = 30;
const slabs = document.querySelector("#slabs");

// All the constants and functions below are defined in `init`.
addOnPostRun(init);

const NUM_FREE_BUCKETS = 64; // not worth fetching from C++ because emmalloc is built around this number
const FREE_REGION_FLAG = 0x1;
let MALLOC_ALIGNMENT;
let SIZEOF_PTR;
let REGION_HEADER_SIZE;

let claim_more_memory;
let compute_free_list_bucket;
let free;
let malloc;
let pListOfAllRegions;
let pFreeRegionBuckets;
let pFreeRegionBucketsUsed;
let sbrk;

/** @type {StructDef} */
let Region;
/** @type {StructDef} */
let RootRegion;

class RegionImpl {
    get ceilingSize() {
        return load(HEAPU8, this.__addr + this.size - SIZEOF_PTR, SIZEOF_PTR);
    }

    get used() {
        return this.size === this.ceilingSize;
    }

    get free() {
        return !!(this.ceilingSize & FREE_REGION_FLAG);
    }
}

class RootRegionImpl {
    get ceilingSize() {
        return load(HEAPU8, this.__addr + this.size - SIZEOF_PTR, SIZEOF_PTR);
    }
}

const bucketSizes = [
    [8, 15],
    [16, 23],
    [24, 31],
    [32, 39],
    [40, 47],
    [48, 55],
    [56, 63],
    [64, 71],
    [72, 79],
    [80, 87],
    [88, 95],
    [96, 103],
    [104, 111],
    [112, 119],
    [120, 159],
    [160, 191],
    [192, 223],
    [224, 255],
    [256, 319],
    [320, 383],
    [384, 447],
    [448, 511],
    [512, 639],
    [640, 767],
    [768, 895],
    [896, 1023],
    [1024, 1279],
    [1280, 1535],
    [1536, 1791],
    [1792, 2047],
    [2048, 2559],
    [2560, 3071],
    [3072, 3583],
    [3584, 6143],
    [6144, 8191],
    [8192, 12287],
    [12288, 16383],
    [16384, 24575],
    [24576, 32767],
    [32768, 49151],
    [49152, 65535],
    [65536, 98303],
    [98304, 131071],
    [131072, 196607],
    [196608, 262143],
    [262144, 393215],
    [393216, 524287],
    [524288, 786431],
    [786432, 1048575],
    [1048576, 1572863],
    [1572864, 2097151],
    [2097152, 3145727],
    [3145728, 4194303],
    [4194304, 6291455],
    [6291456, 8388607],
    [8388608, 12582911],
    [12582912, 16777215],
    [16777216, 25165823],
    [25165824, 33554431],
    [33554432, 50331647],
    [50331648, 67108863],
    [67108864, 100663295],
    [100663296, 134217727],
    [134217728, Number.MAX_SAFE_INTEGER],
];

function init() {
    MALLOC_ALIGNMENT = Module.ccall("_MALLOC_ALIGNMENT", "number");
    SIZEOF_PTR = Module.ccall("_sizeof_ptr", "number");
    REGION_HEADER_SIZE = 2 * SIZEOF_PTR;

    claim_more_memory = Module.cwrap("_claim_more_memory", "bool", ["number"]);
    compute_free_list_bucket = Module.cwrap("_compute_free_list_bucket", "number", ["number"]);
    free = Module.cwrap("_free", null, ["number"]);
    malloc = Module.cwrap("_malloc", "number", ["number"]);
    pListOfAllRegions = Module.cwrap("pListOfAllRegions", "number");
    pFreeRegionBuckets = Module.cwrap("pFreeRegionBuckets", "number");
    pFreeRegionBucketsUsed = Module.cwrap("pFreeRegionBucketsUsed", "number");
    sbrk = Module.cwrap("_sbrk", "number", ["number"]);

    Region = StructDef.newFromC("Region", [
        "size",
        "prev",
        "next",
        "_at_the_end_of_this_struct_size",
    ], RegionImpl);
    RootRegion = StructDef.newFromC("RootRegion", [
        "size",
        "next",
        "endPtr",
    ], RootRegionImpl);

    draw();
}

const llmv = new LLMV();

function draw() {
    slabs.innerHTML = "";

    {
        slabs.appendChild(E("h5", [], `ASCII Strings`));

        const str = "Hello, ASCII!";
        const addr = 1024;
        const fields = [];
        for (let i = 0; i < str.length; i++) {
            fields.push({
                addr: addr + i,
                size: 1,
                content: byte(str.charCodeAt(i)),
                name: str.charAt(i),
            });
        }
        slabs.appendChild(llmv.renderTape({
            regions: [{
                addr: addr,
                size: str.length,
                fields: fields,
                description: `"${str}"`,
            }],
        }))
    }

    {
        slabs.appendChild(E("h5", [], `UTF-8 Strings`));

        const str = "👨🏻‍⚕️ gimme €5000";
        const encoder = new TextEncoder();
        const addr = 2048;
        const fields = [];
        let byteLen = 0;
        for (const c of str) {
            const startAddr = addr + byteLen;
            const bytes = encoder.encode(c);
            const byteFields = [];
            for (let i = 0; i < bytes.length; i++) {
                byteFields.push({
                    addr: startAddr + i,
                    size: 1,
                    content: byte(bytes[i]),
                });
                byteLen++;
            }
            fields.push({
                addr: startAddr,
                size: byteFields.length,
                content: byteFields,
                name: c,
            });
        }
        slabs.appendChild(llmv.renderTape({
            regions: [{
                addr: addr,
                size: str.length,
                fields: fields,
                description: `"${str}"`,
            }],
        }))
    }

    console.group("root regions");
    {
        const ppRoot = pListOfAllRegions();
        let pRoot = load(HEAPU8, ppRoot, SIZEOF_PTR);
        let i = 0;
        while (pRoot) {
            const root = RootRegion.load(HEAPU8, pRoot);
            console.group(`Slab ${i}`);
            {
                slabs.appendChild(E("h5", [], `Slab ${i}`));

                /** @type {Tape} */
                const slab = {
                    regions: [],
                };

                console.log("RootRegion", root);
                // const rootPaddingBytes = root.size - Region.size; // WEIRDNESS but it is correct
                slab.regions.push({
                    addr: root.__addr,
                    size: root.size,
                    fields: [
                        structField(root, "size"),
                        structField(root, "next"),
                        structField(root, "endPtr"),
                        {
                            addr: root.__addr + root.size - RootRegion.sizeof("size"), // weird but correct
                            size: RootRegion.sizeof("size"),
                            name: "size | free",
                            content: hex(root.ceilingSize),
                        },
                    ],
                    description: "RootRegion (sentinel)",
                });

                let regionAddr = root.__addr + root.size;
                while (regionAddr !== root.endPtr) {
                    const region = Region.load(HEAPU8, regionAddr);

                    const isSentinel = region.__addr + region.size === root.endPtr;
                    const descriptor = isSentinel ? "sentinel" : (region.used ? "used" : "free");

                    console.log(`Region (${descriptor})`, region);

                    if (region.__addr > root.endPtr) {
                        throw new Error(`inconsistent state: Region at addr ${region.__addr} is past RootRegion.endPtr = ${root.endPtr}`);
                    }

                    // TODO: render "breaks" in the payload/padding if wider than the max allowed
                    /** @type {Region} */
                    const r = {
                        addr: region.__addr,
                        size: region.size,
                        fields: [
                            structField(region, "size"),
                            // more to come
                        ],
                        description: "",
                    };
                    if (isSentinel) {
                        // nothing else
                    } else if (region.used) {
                        const payloadBytes = region.size - REGION_HEADER_SIZE;
                        const payload = E("div", ["payload", "flex-grow-1", "pa1", "f6", "flex", "flex-column", "justify-center", "tc"], [
                            E("span", ["payload-allocated", "code"], "allocated"),
                            E("span", ["payload-free", "code"], "(click to free)"),
                            E("span", ["f7", "white-60", "mt1"], `${hex(payloadBytes)} bytes`),
                        ]);
                        payload.addEventListener("click", () => {
                            free(region.__addr + Region.sizeof("size"));
                            draw();
                        });
                        r.fields.push({
                            addr: r.addr + Region.sizeof("size"),
                            size: payloadBytes,
                            content: payload,
                        });
                    } else {
                        r.fields.push(structField(region, "prev"));
                        r.fields.push(structField(region, "next"));
                    }
                    r.fields.push({
                        addr: region.__addr + region.size - Region.sizeof("_at_the_end_of_this_struct_size"),
                        size: Region.sizeof("_at_the_end_of_this_struct_size"),
                        content: E("div", ["pa1"], region.used ? hex(region.ceilingSize) : [
                            hex(region.ceilingSize).slice(0, -1),
                            E("span", ["c2"], hex(region.ceilingSize).slice(-1)),
                        ]),
                        name: [
                            "size | ",
                            E("span", region.free && ["c2", "b"], "free"),
                        ],
                    });

                    if (!isSentinel) {
                        r.bars = [{
                            addr: region.__addr + Region.sizeof("size"),
                            size: region.size - Region.sizeof("size") - Region.sizeof("_at_the_end_of_this_struct_size"),
                            color: "var(--color-1)",
                        }];
                    }

                    const descriptorEl = isSentinel ? "sentinel" : E("span", region.free && ["c2", "b"], descriptor);
                    r.description = [
                        "Region (",
                        !isSentinel && F([
                            E("span", ["c1", "b"], `${hex(region.size - REGION_HEADER_SIZE)} bytes`),
                            ", ",
                        ]),
                        descriptorEl,
                        ")",
                    ];

                    slab.regions.push(r);
                    regionAddr += region.size;
                }

                slabs.appendChild(llmv.renderTape(slab));
            }
            console.groupEnd();
            pRoot = root.next;
            i += 1;
        }
    }
    console.groupEnd();

    console.groupCollapsed("free list buckets");
    {
        const buckets = Region.loadArray(HEAPU8, pFreeRegionBuckets(), NUM_FREE_BUCKETS);
        for (const [i, bucket] of buckets.entries()) {
            console.group(`Bucket ${i} (${bucketSizes[i][0] + REGION_HEADER_SIZE}-${bucketSizes[i][1]+ REGION_HEADER_SIZE} bytes, ${bucketSizes[i][0]}-${bucketSizes[i][1]} byte allocations)`);
            {
                console.log(bucket);
                const startAddr = bucket.__addr;
                let addr = bucket.next;
                while (addr !== startAddr) {
                    const freeRegion = Region.load(HEAPU8, addr);
                    console.log(freeRegion, freeRegion.ceilingSize);
                    addr = freeRegion.next;
                }
            }
            console.groupEnd();
        }
    }
    console.groupEnd();
}

function mallocAndDraw(size) {
    const addr = malloc(size);
    draw();
    console.log(`malloced ${size} bytes at ${hex(addr)}`);
}

function sbrkAndDraw(size) {
    sbrk(size);
    draw();
}

function byte(n) {
    return hex(n, false);
}

function hex(n, prefix = true) {
    return `${prefix ? "0x" : ""}${n.toString(16)}`;
}

/**
 * @param {*} s 
 * @param {string} name 
 * @param {BNode} [content]
 * @param {BNode} [displayName]
 * @returns {Field}
 */
function structField(s, name, content = null, displayName = null) {
    return {
        addr: s.__addr + s.__def.offsetof(name),
        size: s.__def.sizeof(name),
        name: displayName ?? name,
        content: content ?? hex(s[name]),
    };
}

function test() {
    malloc(3);
    const f = malloc(3);
    malloc(3);
    malloc(64);
    free(f);

    draw();
}
