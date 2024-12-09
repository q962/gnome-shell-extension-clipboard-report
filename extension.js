/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Shell from "gi://Shell";
import Meta from "gi://Meta";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import DBusManager from "./DBusManager.js";
import MimeTypesRegistryManager from "./MimeTypesRegistryManager.js";

export default class ClipboardReport extends Extension {
  enable() {
    DBusManager.own_name();

    const metaDisplay = Shell.Global.get().get_display();
    const selection = metaDisplay.get_selection();

    this.selection = selection;
    this._selectionOwnerChangedId = selection.connect(
      "owner-changed",
      (selection, selectionType, selectionSource) => {
        if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD) return;
        if (!selectionSource) return;

        MimeTypesRegistryManager.notify(selectionSource);
      }
    );
  }

  disable() {
    DBusManager.unown_name();

    this.selection.disconnect(this._selectionOwnerChangedId);
  }
}
