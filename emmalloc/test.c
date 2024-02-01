#include <unistd.h>

#define EMMALLOC_VERBOSE 1
#define EMMALLOC_NO_STD_EXPORTS 1
#include "emmalloc.c"

// It is defined, I swear, but clangd too stupid
#ifndef EMSCRIPTEN_KEEPALIVE
#define EMSCRIPTEN_KEEPALIVE
#endif

EMSCRIPTEN_KEEPALIVE size_t _MALLOC_ALIGNMENT() { return MALLOC_ALIGNMENT; }
EMSCRIPTEN_KEEPALIVE size_t _sizeof_ptr() { return sizeof(size_t); }

EMSCRIPTEN_KEEPALIVE RootRegion **pListOfAllRegions() {
  return &listOfAllRegions;
}
EMSCRIPTEN_KEEPALIVE Region *pFreeRegionBuckets() { return freeRegionBuckets; }
EMSCRIPTEN_KEEPALIVE BUCKET_BITMASK_T *pFreeRegionBucketsUsed() {
  return &freeRegionBucketsUsed;
}

EMSCRIPTEN_KEEPALIVE void *_malloc(size_t size) {
  return emmalloc_malloc(size);
}
EMSCRIPTEN_KEEPALIVE void _free(void *ptr) { emmalloc_free(ptr); }
EMSCRIPTEN_KEEPALIVE bool _claim_more_memory(size_t numBytes) {
  return claim_more_memory(numBytes);
}
EMSCRIPTEN_KEEPALIVE int _compute_free_list_bucket(size_t allocSize) {
  return compute_free_list_bucket(allocSize);
}
EMSCRIPTEN_KEEPALIVE void *_sbrk(intptr_t increment) { return sbrk(increment); }

#define STRUCT(s)                                                              \
  EMSCRIPTEN_KEEPALIVE size_t sizeof_##s() { return sizeof(s); }
#define FIELD(s, f)                                                            \
  EMSCRIPTEN_KEEPALIVE size_t sizeof_##s##_##f() {                             \
    return sizeof(((s *)0)->f);                                                \
  }                                                                            \
  EMSCRIPTEN_KEEPALIVE size_t offsetof_##s##_##f() { return offsetof(s, f); }

STRUCT(Region)
FIELD(Region, size) FIELD(Region, prev) FIELD(Region, next)
    FIELD(Region, _at_the_end_of_this_struct_size)

        STRUCT(RootRegion) FIELD(RootRegion, size) FIELD(RootRegion, next)
            FIELD(RootRegion, endPtr)
