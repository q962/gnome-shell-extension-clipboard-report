import Gio from "gi://Gio";

import { ArrayBuilder, stream_to_array } from "./utils.js";
import DBusManager from "./DBusManager.js";

class MimeTypesRegistryManager {
  #cancellable = null;
  #registerd_mimetypes = {};
  #cbs = {};
  #cb_key = 0;

  notify(selectionSource) {
    let cancellable = new Gio.Cancellable();

    let old_cancellable = this.#cancellable;
    this.#cancellable = cancellable;

    if (old_cancellable) old_cancellable.cancel();

    let register_mimetypes_data = {};
    let register_mimetype_count = 0;

    log(selectionSource.get_mimetypes());

    for (let mimetype of selectionSource.get_mimetypes()) {
      if (!(mimetype in this.#registerd_mimetypes)) continue;

      register_mimetype_count += 1;

      selectionSource.read_async(mimetype, cancellable, (obj, res) => {
        try {
          let stream = obj.read_finish(res); // may be cancelled

          stream_to_array(stream, (array) => {
            register_mimetypes_data[mimetype] = array;

            register_mimetype_count -= 1;

            if (register_mimetype_count != 0) return;
            if (cancellable && cancellable.is_cancelled()) return;

            for (let key in this.#cbs) {
              let data = this.#cbs[key];
              let cb = data.cb;
              let cb_arg = {};

              for (let _m of data.mimetypes) {
                if (!(_m in register_mimetypes_data)) continue;
                cb_arg[_m] = register_mimetypes_data[_m];
              }

              cb(cb_arg);
            }
          });
        } catch (e) {
          log(e);
        }
      });
    }
  }

  register(mimetypes, cb) {
    if (!Array.isArray(mimetypes)) return;
    if (mimetypes.length == 0) return;
    if (typeof cb != "function") return;

    for (let mimetype of mimetypes) {
      let data = (this.#registerd_mimetypes[mimetype] = //
        this.#registerd_mimetypes[mimetype] || {
          count: 0,
        });

      data.count += 1;
    }

    this.#cbs[++this.#cb_key] = {
      mimetypes: Array.from(mimetypes),
      cb: cb,
    };

    return this.#cb_key;
  }

  unregister(cb_key, mimetypes) {
    if (!(cb_key in this.#cbs)) return 0;

    let cb_data = this.#cbs[cb_key];

    if (mimetypes) {
      if (typeof mimetypes != "array") return 0;
      if (mimetypes.length == 0) return 0;
    } else {
      mimetypes = cb_data.mimetypes;
    }

    let null_count = 0;
    for (let i = 0; i < mimetypes.length; i++) {
      let mimetype = mimetypes[i];
      if (!(mimetype in this.#registerd_mimetypes)) continue;

      let data = this.#registerd_mimetypes[mimetype];
      data.count -= 1;

      cb_data.mimetypes[i] = null;
      null_count += 1;

      if (data.count <= 0) delete this.#registerd_mimetypes[mimetype];
    }

    if (null_count == cb_data.mimetypes.length) {
      delete data.cbs[cb_key];
    }

    return null_count;
  }
}

export default new MimeTypesRegistryManager();
