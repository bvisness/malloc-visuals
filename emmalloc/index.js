// All the constants and functions below are defined in `init`.
addOnPostRun(init);

let MALLOC_ALIGNMENT;
let SIZEOF_PTR;
const NUM_FREE_BUCKETS = 64; // not worth fetching from C++ because emmalloc is built around this number
const FREE_REGION_FLAG = 0x1;

let free;
let malloc;
let pListOfAllRegions;
let pFreeRegionBuckets;
let pFreeRegionBucketsUsed;

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

    free = Module.cwrap("_free", null, ["number"]);
    malloc = Module.cwrap("_malloc", "number", ["number"]);
    pListOfAllRegions = Module.cwrap("pListOfAllRegions", "number");
    pFreeRegionBuckets = Module.cwrap("pFreeRegionBuckets", "number");
    pFreeRegionBucketsUsed = Module.cwrap("pFreeRegionBucketsUsed", "number");

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
    ]);

    malloc(3);
    const f = malloc(3);
    malloc(3);
    malloc(64);
    free(f);

    draw();
}

function draw() {
    console.group("root regions");
    {
        const ppRoot = pListOfAllRegions();
        let pRoot = load(HEAPU8, ppRoot, SIZEOF_PTR);
        let i = 0;
        while (pRoot) {
            const root = RootRegion.load(HEAPU8, pRoot);
            console.group(`Slab ${i}`);
            {
                console.log("RootRegion", root);
                
                // why we add sizeof(Region) is not entirely clear to me...but
                // sizeof(RootRegion) < sizeof(Region) so whatever
                let regionAddr = root.__addr + Region.size;
                while (regionAddr !== root.endPtr) {
                    const region = Region.load(HEAPU8, regionAddr);
                    console.log(`Region (${region.used ? "used" : "free"})`, region);
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
            console.group(`Bucket ${i} (${bucketSizes[i][0]}-${bucketSizes[i][1]} bytes)`);
            {
                console.log(bucket);
                const startAddr = bucket.__addr;
                let addr = bucket.next;
                while (addr !== startAddr) {
                    const freeRegion = Region.load(HEAPU8, addr);
                    console.log(freeRegion.used, freeRegion.free, freeRegion.ceilingSize, freeRegion);
                    addr = freeRegion.next;
                }
            }
            console.groupEnd();
        }
    }
    console.groupEnd();
}
