addOnPostRun(init);

let MALLOC_ALIGNMENT;
let SIZEOF_PTR;
const NUM_FREE_BUCKETS = 64; // not worth fetching from C++ because emmalloc is built around this number

let free;
let malloc;
let pListOfAllRegions;
let pFreeRegionBuckets;
let pFreeRegionBucketsUsed;

/** @type {StructDef} */
let Region;
/** @type {StructDef} */
let RootRegion;

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
    ]);
    RootRegion = StructDef.newFromC("RootRegion", [
        "size",
        "next",
        "endPtr",
    ]);

    malloc(3);
    malloc(64);

    draw();
}

function draw() {
    console.group("root regions");
    {
        const ppRoot = pListOfAllRegions();
        let pRoot = load(HEAPU8, ppRoot, SIZEOF_PTR);
        while (pRoot) {
            const root = RootRegion.load(HEAPU8, pRoot);
            console.log(root);
            pRoot = root.next;
        }
    }
    console.groupEnd();

    console.group("free list buckets");
    {
        const buckets = Region.loadArray(HEAPU8, pFreeRegionBuckets(), NUM_FREE_BUCKETS);
        for (const bucket of buckets) {
            console.log(bucket);
        }
    }
    console.groupEnd();
}
