// Polyfill for Node.js server-side File API
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {
    name: string;
    size: number;
    type: string;
    lastModified: number;

    constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
      this.name = name;
      this.size = bits.reduce((acc, bit) => {
        if (typeof bit === 'string') return acc + bit.length;
        if (bit instanceof Blob) return acc + bit.size;
        if (bit instanceof ArrayBuffer) return acc + bit.byteLength;
        return acc + (bit as ArrayBufferView).byteLength || 0;
      }, 0);
      this.type = options?.type || '';
      this.lastModified = options?.lastModified || Date.now();
    }

    stream(): ReadableStream<Uint8Array> {
      throw new Error('File.stream() not implemented in server polyfill');
    }

    arrayBuffer(): Promise<ArrayBuffer> {
      throw new Error('File.arrayBuffer() not implemented in server polyfill');
    }

    text(): Promise<string> {
      throw new Error('File.text() not implemented in server polyfill');
    }

    slice(): Blob {
      throw new Error('File.slice() not implemented in server polyfill');
    }
  } as typeof File;
}

export {};