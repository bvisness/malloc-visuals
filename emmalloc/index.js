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

function draw() {
    slabs.innerHTML = "";

    console.group("root regions");
    {
        const ppRoot = pListOfAllRegions();
        let pRoot = load(HEAPU8, ppRoot, SIZEOF_PTR);
        let i = 0;
        while (pRoot) {
            const root = RootRegion.load(HEAPU8, pRoot);
            console.group(`Slab ${i}`);
            slabs.appendChild(E("h5", [], `Slab ${i}`));
            {
                const slab = E("div", ["slab", "flex", "flex-wrap"]);
                slabs.appendChild(slab);

                console.log("RootRegion", root);
                const rootPaddingBytes = root.size - Region.size; // WEIRDNESS but it is correct
                const rootDiv = E("div", ["region", "root"], [
                    E("div", ["code", "f7", "white-60", "flex", "flex-column", "justify-end", "pl1", "pb1"], [
                        hex(root.__addr),
                    ]),
                    E("div", ["region-fields"], [
                        Field("size", hex(root.size), RootRegion.sizeof("size")),
                        Field("next", hex(root.next), RootRegion.sizeof("next")),
                        Field("endPtr", hex(root.endPtr), RootRegion.sizeof("endPtr")),
                        rootPaddingBytes && Padding(rootPaddingBytes),
                        Field("size | free", hex(root.ceilingSize), RootRegion.sizeof("size")),
                    ]),
                    E("div", ["h--bar"]),
                    E("div", ["ph1", "tc", "flex-grow-1"], [
                        E("span", ["f7"], "RootRegion (sentinel)"),
                    ]),
                ]);
                slab.appendChild(rootDiv);

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
                    const regionDiv = E("div", ["region"], [
                        E("div", ["code", "f7", "white-60", "flex", "flex-column", "justify-end", "pl1", "pb1"], [
                            hex(region.__addr),
                        ]),
                    ]);
                    const regionFields = E("div", ["region-fields"], [
                        Field("size", hex(region.size), Region.sizeof("size")),
                    ]);
                    if (isSentinel) {
                        regionFields.appendChild(Padding(region.size - REGION_HEADER_SIZE));
                    } else if (region.used) {
                        const payloadBytes = region.size - REGION_HEADER_SIZE;
                        const payload = E("div", ["payload", "pa1", "f6", "bl", "flex", "flex-column", "justify-center", "tc"], [
                            E("span", ["payload-allocated", "code"], "allocated"),
                            E("span", ["payload-free", "code"], "(click to free)"),
                            E("span", ["f7", "white-60", "mt1"], `${hex(payloadBytes)} bytes`),
                        ]);
                        payload.style.width = width(payloadBytes);
                        payload.addEventListener("click", () => {
                            free(region.__addr + Region.sizeof("size"));
                            draw();
                        });
                        regionFields.appendChild(payload);
                    } else {
                        regionFields.appendChild(Field("prev", hex(region.prev), Region.sizeof("prev")));
                        regionFields.appendChild(Field("next", hex(region.next), Region.sizeof("next")));

                        const paddingBytes = region.size - Region.size;
                        if (paddingBytes) {
                            regionFields.appendChild(Padding(paddingBytes));
                        }
                    }
                    regionFields.appendChild(Field(
                        [
                            "size | ",
                            E("span", region.free && ["c2", "b"], "free"),
                        ],
                        E("span", [], region.used ? hex(region.ceilingSize) : [
                            hex(region.ceilingSize).slice(0, -1),
                            E("span", ["c2"], hex(region.ceilingSize).slice(-1)),
                        ]),
                        Region.sizeof("_at_the_end_of_this_struct_size"),
                    ));
                    regionDiv.appendChild(regionFields);

                    if (isSentinel) {
                        regionDiv.appendChild(E("div", ["h--bar"]));
                    } else {
                        const sizeBar = E("div", ["size-bar", "h--bar"]);
                        sizeBar.style.marginLeft = width(Region.sizeof("size"));
                        sizeBar.style.marginRight = `calc(${width(Region.sizeof("_at_the_end_of_this_struct_size"))} - 1px)`;
                        regionDiv.appendChild(sizeBar);
                    }

                    const descriptorEl = isSentinel ? "sentinel" : E("span", region.free && ["c2", "b"], descriptor);
                    regionDiv.appendChild(E("div", ["ph1", "tc", "flex-grow-1"], [
                        E("span", ["f7"], [
                            "Region (",
                            !isSentinel && F([
                                E("span", ["c1", "b"], `${hex(region.size - REGION_HEADER_SIZE)} bytes`),
                                ", ",
                            ]),
                            descriptorEl,
                            ")",
                        ]),
                    ]));

                    slab.appendChild(regionDiv);
                    regionAddr += region.size;
                }
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

function Field(name, value, size) {
    const e = E("div", ["field", "flex", "flex-column", "tc"], [
        E("div", ["flex-grow-1", "pa1", "flex", "flex-column", "justify-center", "code", "f6"], [
            value,
        ]),
        E("div", ["bt", "b--white-60", "white-60", "pa1", "f7"], name),
    ]);
    e.style.width = width(size);
    return e;
}

function Padding(bytes) {
    const res = E("div", ["bl", "b--white-60", "striped"]);
    res.style.width = width(bytes);
    return res;
}

function hex(n) {
    return `0x${n.toString(16)}`;
}

function width(bytes) {
    return `${Math.min(bytes * BYTE_WIDTH_REM, MAX_WIDTH_REM)}rem`;
}

function test() {
    malloc(3);
    const f = malloc(3);
    malloc(3);
    malloc(64);
    free(f);

    draw();
}
