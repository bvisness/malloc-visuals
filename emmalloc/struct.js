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
}
