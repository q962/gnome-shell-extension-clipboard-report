import Gio from "gi://Gio";
import GioUnix from "gi://GioUnix";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";

import { stream_to_array } from "./utils.js";

const ByteArray = imports.byteArray;

const metaDisplay = Shell.Global.get().get_display();
const selection = metaDisplay.get_selection();

const encoder = new TextEncoder();

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

import MimeTypesRegistryManager from "./MimeTypesRegistryManager.js";

class Clients {
  #clients = {};

  set(client, mimetypes, fd) {
    this.remove(client);

    mimetypes = Array.from(mimetypes);

    let data = (this.#clients[client] = {
      mimetypes: mimetypes,
      fd: fd,
      cb_id: 0,
    });

    data.cb_id = MimeTypesRegistryManager.register(
      mimetypes,
      (mimetypes_data) => {
        let memory_stream = new Gio.MemoryInputStream();

        let all_data_length = 0;
        let mimetype_count = 0;
        let stream_datas = [];

        for (let mimetype in mimetypes_data) {
          let mimetype_data = mimetypes_data[mimetype];

          const header = encoder.encode(
            `MimeType: ${mimetype}; Content-Length: ${mimetype_data.length}\r\n\r\n`
          );

          stream_datas.push(header);
          stream_datas.push(mimetype_data);

          all_data_length += header.length + mimetype_data.length;
          mimetype_count += 1;
        }

        memory_stream.add_bytes(
          encoder.encode(
            `MimeType-Count: ${mimetype_count}; Content-Length: ${all_data_length}\r\n\r\n`
          )
        );
        for (let stream_data of stream_datas) {
          memory_stream.add_bytes(stream_data);
        }

        let output = GioUnix.OutputStream.new(data.fd, false);
        output.splice_async(
          memory_stream,
          Gio.OutputStreamSpliceFlags.NONE,
          0,
          null,
          null
        );
      }
    );
  }

  remove(client, mimetypes) {
    if (!(client in this.#clients)) return;

    let data = this.#clients[client];

    if (!mimetypes) mimetypes = data.mimetypes;

    let remove_count = MimeTypesRegistryManager.unregister(
      data.cb_id,
      mimetypes
    );

    if (remove_count == data.mimetypes.length) {
      GLib.close(data.fd);
      delete this.#clients[client];
    } else {
      for (let i = data.mimetypes.length - 1; i >= 0; i--) {
        let mimetype = data.mimetypes[i];

        if (mimetypes.indexOf(mimetype) != -1) {
          data.mimetypes.splice(i, 1);
        }
      }
    }
  }

  remove_all() {
    for (let client in this.#clients) {
      this.remove(client);
    }
  }
}

class Server {
  constructor(clients) {
    this.clients = clients;
  }

  async registerAsync(args, invocation) {
    let [mimetypes] = args;

    const sender = invocation.get_sender();
    let message = invocation.get_message();
    let fd_list = message.get_unix_fd_list();

    if (mimetypes.length == 0) {
      invocation.return_dbus_error(
        "io.github.q962.ClipboardReport.register",
        _("Empty MimeType")
      );
      return;
    }

    if (!fd_list || fd_list.get_length() == 0) {
      invocation.return_dbus_error(
        "io.github.q962.ClipboardReport.register",
        _("Need fd!")
      );
      return;
    }

    let fd = fd_list.get(0);
    try {
      this.clients.set(sender, mimetypes, fd);
      invocation.return_value(null);
    } catch (e) {
      GLib.close(fd);
      invocation.return_dbus_error(
        "io.github.q962.ClipboardReport.register",
        e
      );
    }
  }

  async unregisterAsync(args, invocation) {
    const sender = invocation.get_sender();
    let [mimetypes] = args;

    this.clients.remove(sender, mimetypes);

    invocation.return_value(null);
  }

  async setAsync(args, invocation) {
    let [mimetype] = args;
    try {
      let message = invocation.get_message();
      let fd_list = message.get_unix_fd_list();

      if (!fd_list || fd_list.get_length() == 0) {
        invocation.return_dbus_error(
          "io.github.q962.ClipboardReport.set",
          _("Need fd!")
        );
        return;
      }

      let fd = fd_list.get(0);

      let istream = GioUnix.InputStream.new(fd, false);
      stream_to_array(istream, (array) => {
        print(ByteArray.toString(array));

        let selection_source = Meta.SelectionSourceMemory.new(mimetype, array);
        selection.set_owner(
          Meta.SelectionType.SELECTION_CLIPBOARD,
          selection_source
        );

        GLib.close(fd);

        invocation.return_value(null);
      });
    } catch (e) {
      print(e);
    }
  }
}

class DBusManager {
  #exportedObject = null;
  #ownerId = 0;
  #subscription_id = 0;
  #socket = null;
  #socket_path = null;

  constructor() {
    this.clients = new Clients();

    const interfaceXml = `
    <node>
      <interface name="io.github.q962.ClipboardReport">
        <method name="register">
          <arg type="as" direction="in" name="mimetypes"/>
        </method>
        <method name="unregister">
          <arg type="as" direction="in" name="mimetypes"/>
        </method>
        <method name="set">
          <arg type="s" direction="in" name="mimetype"/>
        </method>
      </interface>
    </node>`;

    this.#exportedObject = Gio.DBusExportedObject.wrapJSObject(
      interfaceXml,
      new Server(this.clients)
    );
  }

  onBusAcquired(connection, name) {
    this.#exportedObject.export(connection, "/io/github/q962/ClipboardReport");

    this.#subscription_id = connection.signal_subscribe(
      "org.freedesktop.DBus",
      "org.freedesktop.DBus",
      "NameOwnerChanged",
      "/org/freedesktop/DBus",
      null,
      Gio.DBusSignalFlags.NONE,
      this.onWatchNameLost.bind(this)
    );
  }

  onNameAcquired(connection, name) {}

  onNameLost(connection, name) {
    this.clear();
  }

  clear() {
    let connection = this.#exportedObject.get_connection();
    this.#exportedObject.unexport();
    connection.signal_unsubscribe(this.#subscription_id);
    this.clients.remove_all();
  }

  onWatchNameLost(connection, sender, path, iface, method, arg) {
    let [owner_name, old_owner_name, new_owner_name] = arg.recursiveUnpack();
    if (new_owner_name.length != 0) return;

    this.clients.remove(owner_name);
  }

  own_name() {
    if (this.#ownerId != 0) return;

    this.#ownerId = Gio.bus_own_name(
      Gio.BusType.SESSION,
      "io.github.q962",
      Gio.BusNameOwnerFlags.NONE,
      this.onBusAcquired.bind(this),
      this.onNameAcquired.bind(this),
      this.onNameLost.bind(this)
    );
  }

  unown_name() {
    if (this.#ownerId == 0) return;

    Gio.bus_unown_name(this.#ownerId);
    this.#ownerId = 0;

    this.clear();
  }
}

export default new DBusManager();
