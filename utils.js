import GLib from "gi://GLib";

export class ArrayBuilder {
  constructor(type_fun) {
    this.type_fun = type_fun;
    this.list = [];
    this.array_all_size = 0;
  }

  append(buffer) {
    this.list.push(buffer);
    this.array_all_size += buffer.length;
  }
  get() {
    const buffer = new this.type_fun(this.array_all_size);
    let offset = 0;
    for (let _bytes of this.list) {
      buffer.set(_bytes, offset);
      offset += _bytes.length;
    }
    return buffer;
  }
}

export function stream_to_array(stream, cb, array_proto) {
  array_proto = array_proto || Uint8Array;

  const read_count = 8192;

  let buffer_builder = new ArrayBuilder(array_proto);

  function readCb(stream, result) {
    let bytes = stream.read_bytes_finish(result);
    if (!bytes) {
      cb();
      return;
    } else if (bytes.get_size() == 0) {
      const buffer = buffer_builder.get();
      cb(buffer);
    } else {
      let _array = bytes.get_data();

      buffer_builder.append(_array);

      stream.read_bytes_async(read_count, GLib.PRIORITY_DEFAULT, null, readCb);
    }
  }

  stream.read_bytes_async(read_count, GLib.PRIORITY_DEFAULT, null, readCb);
}
