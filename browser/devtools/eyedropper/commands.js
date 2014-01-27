/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Cu } = require("chrome");
module.exports = [];

Cu.import("resource://gre/modules/devtools/gcli.jsm");

// Fetch EyedropperManager using the current loader, but don't save a
// reference to it, because it might change with a tool reload.
// We can clean this up once the command line is loadered.
Object.defineProperty(this, "Eyedropper", {
  get: function() {
    return require("devtools/eyedropper/eyedropper").Eyedropper;
  },
  enumerable: true
});

/**
* 'eyedropper' command
*/
gcli.addCommand({
  name: "eyedropper",
  description: "Magnify areas of page to inspect pixels and colors",
  buttonId: "command-button-eyedropper",
  buttonClass: "command-button",
  tooltipText: "Pixel Inspector",

  exec: function(args, context) {
    let chromeWindow = context.environment.chromeWindow;

    let eyedropper = new Eyedropper(chromeWindow);
    eyedropper.open();
  }
});