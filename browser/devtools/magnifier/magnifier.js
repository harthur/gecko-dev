const {Cc, Ci, Cu} = require("chrome");

Cu.import("resource://gre/modules/Services.jsm");

const {colorUtils} = require("devtools/css-color");
const CssColor = colorUtils.CssColor;
let EventEmitter = require("devtools/shared/event-emitter");

loader.lazyGetter(this, "gDevTools",
  () => Cu.import("resource:///modules/devtools/gDevTools.jsm", {}).gDevTools);

loader.lazyGetter(this, "clipboardHelper", function() {
  return Cc["@mozilla.org/widget/clipboardhelper;1"].
    getService(Ci.nsIClipboardHelper);
});

const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const MAGNIFIER_URL = "chrome://browser/content/devtools/magnifier.xul";
//const ZOOM_PREF    = "devtools.magnifier.zoom";
//const FORMAT_PREF    = "devtools.magnifier.format";

const PANEL_STYLE = "border:1px solid #333;width:96px;height:120px";
const CANVAS_WIDTH = 96;

/**
 * let dropper = new EyeDropper(window);
 * dropper.open({x, y});
 * dropper.close();
 * dropper.on("move", (x, y, color) => {})
 * dropper.on("select", (x, y, color) => {})
 */

function Magnifier(chromeWindow, opts = { copyOnSelect: true }) {
  const { copyOnSelect } = opts;
  this.onMouseMove = this.onMouseMove.bind(this);
  this.onMouseDown = this.onMouseDown.bind(this);
  this.onKeyDown = this.onKeyDown.bind(this);

  this.chromeWindow = chromeWindow;
  this.chromeDocument = chromeWindow.document;

  this.dragging = true;
  this.popupSet = this.chromeDocument.querySelector("#mainPopupSet");

  let zoom = 6; //Services.prefs.getIntPref(ZOOM_PREF);
  this.zoomWindow = {
    x: 0,          // the left coordinate of the center of the inspected region
    y: 0,          // the top coordinate of the center of the inspected region
    width: 1,      // width of canvas to draw zoomed area onto
    height: 1,     // height of canvas
    zoom: zoom     // zoom level - integer, minimum is 2
  };

  this.format = "rgb"; //Services.prefs.getCharPref(FORMAT_PREF);
  this.copyOnSelect = copyOnSelect;

  EventEmitter.decorate(this);
}

exports.Magnifier = Magnifier;

Magnifier.prototype = {
  /**
   * The number of cells (blown-up pixels) per direction in the grid.
   */
  get cellsWide() {
    let { width, zoom } = this.zoomWindow;

    // Canvas will render whole "pixels" (cells) only, and an even
    // number at that. Round up to the nearest even number of pixels.
    let cellsWide = Math.ceil(width / zoom)
    cellsWide += cellsWide % 2;

    return cellsWide;
  },

  /**
   * Size of each cell (blown-up pixel) in the grid.
   */
  get cellSize() {
    return this.zoomWindow.width / this.cellsWide;
  },

  /**
   * Get index of cell in the center of the grid.
   */
  get centerCell() {
    return Math.floor(this.cellsWide / 2);
  },

  /**
   * Get color of center cell in the grid.
   */
  get centerColor() {
    let x = y = (this.centerCell * this.cellSize) + (this.cellSize / 2);
    let rgb = this.ctx.getImageData(x, y, 1, 1).data;
    return new CssColor("rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")");
  },

  toggle: function() {
    if (this._panel) {
      this.destroy();
    }
    else {
      this.open();
    }
  },

  open: function(options={}) {
    let { screenX, screenY } = options;

    this._panel = this.buildPanel();

    this.addListeners();
    this.popupSet.appendChild(this._panel);

    let win = this.chromeWindow;
    screenX = screenX || (win.screenX + win.outerWidth / 2);
    screenY = screenY || (win.screenY + win.outerHeight / 2);

    this._panel.openPopupAtScreen(screenX, screenY);
  },

  destroy: function() {
    if (this._panel) {
      this.popupSet.removeChild(this._panel);
      this._panel = null;
    }
    this.removeListeners();

    this.emit("destroy");
  },

  buildPanel: function() {
    let panel = this.chromeDocument.createElement("panel");
    panel.id = "devtools-magnifier-indication-panel";
    panel.setAttribute("noautofocus", true);
    panel.setAttribute("noautohide", true);
    panel.setAttribute("backdrag", true);
    panel.setAttribute("level", "floating");
    panel.setAttribute("close", true);
    panel.setAttribute("style", PANEL_STYLE);

    panel.addEventListener("popuphidden", (e) => {
      if (e.target === panel) {
        this.destroy();
      }
    });

    let iframe = this.iframe = this.chromeDocument.createElementNS(XULNS, "iframe");
    iframe.addEventListener("load", this.frameLoaded.bind(this), true);
    iframe.setAttribute("flex", "1");
    iframe.setAttribute("transparent", "true");
    iframe.setAttribute("class", "devtools-magnifier-iframe");
    iframe.setAttribute("src", MAGNIFIER_URL);
    iframe.setAttribute("width", CANVAS_WIDTH);
    iframe.setAttribute("height", CANVAS_WIDTH);

    panel.appendChild(iframe);

    return panel;
  },

  frameLoaded: function() {
    this.iframeDocument =  this.iframe.contentDocument;
    this.canvas = this.iframeDocument.querySelector("#canvas");
    this.ctx = this.canvas.getContext("2d");
    this.canvasContainer = this.iframeDocument.querySelector("#canvas-container")
    this.colorPreview = this.iframeDocument.querySelector("#color-preview");
    this.colorValue = this.iframeDocument.querySelector("#color-value");
    this.canvasOverflow = this.iframeDocument.querySelector("#canvas-overflow");
    let computedOverflowStyle =  this.iframeDocument.defaultView.getComputedStyle(this.canvasOverflow);

    this.zoomWindow.width = parseInt(computedOverflowStyle.getPropertyValue("width"), 10);
    this.zoomWindow.height = parseInt(computedOverflowStyle.getPropertyValue("height"), 10);

    this.addPanelListeners();

    this.drawWindow();
  },

  addPanelListeners: function() {
    this.iframe.contentWindow.addEventListener("click", this.onMouseDown);

    this.colorValues.addEventListener("command", () => {
      this.format = this.colorValues.selectedItem.getAttribute("format");
      //Services.prefs.setCharPref(FORMAT_PREF, this.format);

      this.populateColorValues();
    }, false);

    this.canvas.addEventListener("click", this.onMouseDown);

    this.iframeDocument.addEventListener("keydown", this.maybeCopy.bind(this));
    this.iframeDocument.addEventListener("keydown", this.onKeyDown);

    let closeCmd = this.iframeDocument.getElementById("magnifier-cmd-close");
    closeCmd.addEventListener("command", this.destroy.bind(this), true);

    let copyCmd = this.iframeDocument.getElementById("magnifier-cmd-copy");
    copyCmd.addEventListener("command", this.selectColor.bind(this), true);
  },

  addListeners: function() {
    this.chromeDocument.addEventListener("mousemove", this.onMouseMove);
    this.chromeDocument.addEventListener("mousedown", this.onMouseDown);
  },

  removeListeners: function() {
    this.chromeDocument.removeEventListener("mousemove", this.onMouseMove);
    this.chromeDocument.removeEventListener("mousedown", this.onMouseDown);
  },

  onMouseMove: function(event) {
    if (!this.dragging || !this._panel) {
      return;
    }

    let { width } = this.zoomWindow;
    let win = this.chromeWindow;

    let windowX = win.screenX + (win.outerWidth - win.innerWidth);
    let x = event.screenX - windowX;

    let windowY = win.screenY + (win.outerHeight - win.innerHeight);
    let y = event.screenY - windowY;

    this.moveRegion(x, y);

    let panelX = event.screenX - width / 2;
    let panelY = event.screenY - width / 2;

    this._panel.moveTo(panelX, panelY);
  },

  onMouseDown: function(event) {
    this.toggleDragging(false);

    event.preventDefault();
    event.stopPropagation();

    this.selectColor();
  },

  selectColor: function() {
    this.emit("select", this.colorValues.value);

    if (this.copyOnSelect) {
      this.copyColor(this.destroy.bind(this));
    }
    else {
      this.destroy();
    }
  },

  copyColor: function(cb) {
    Services.appShell.hiddenDOMWindow.clearTimeout(this.copyTimeout);
    clipboardHelper.copyString(this.colorValues.value);
//    this.copyButton.classList.add("highlight");\
    this.copyTimeout = Services.appShell.hiddenDOMWindow.setTimeout(() => {
//      this.copyButton.classList.remove("highlight");

      if (cb && cb.apply) {
        cb();
      }
    }, 750);
  },

  maybeCopy: function(event) {
    if (event.metaKey && event.keyCode === event.DOM_VK_C) {
      this.copyColor();
    }
  },

  onKeyDown: function(event) {
    let offsetX = 0;
    let offsetY = 0;
    let modifier = 1;

    if (event.keyCode === event.DOM_VK_LEFT) {
      offsetX = -1;
    }
    if (event.keyCode === event.DOM_VK_RIGHT) {
      offsetX = 1;
    }
    if (event.keyCode === event.DOM_VK_UP) {
      offsetY = -1;
    }
    if (event.keyCode === event.DOM_VK_DOWN) {
      offsetY = 1;
    }
    if (event.shiftKey) {
      modifier = 10;
    }

    offsetY *= modifier;
    offsetX *= modifier;

    if (offsetX !== 0 || offsetY !== 0) {
      this.moveBy(offsetX, offsetY);
      event.preventDefault();
    }
  },

  moveBy: function(offsetX=0, offsetY=0) {
    this.zoomWindow.x += offsetX;
    this.zoomWindow.y += offsetY;

    this.drawWindow();
  },

  toggleDragging: function(mode) {
    if (mode === false) {
      this.dragging = false;
    }
    else if (mode === true) {
      this.dragging = true;
    }
    else {
      this.dragging = !this.dragging;
    }
  },

  moveRegion: function(x, y) {
    this.zoomWindow.x = x;
    this.zoomWindow.y = y;

    this.drawWindow();
  },

  drawWindow: function() {
    let { width, height, x, y, zoom } = this.zoomWindow;

    this.canvas.width = width;
    this.canvas.height = height;

    let drawY = y - (height / 2);
    let drawX = x - (width / 2);

    this.ctx.mozImageSmoothingEnabled = false;

    this.ctx.drawWindow(this.chromeWindow, drawX, drawY, width, height, "white");

    if (zoom > 1) {
      let zoomedWidth = width / zoom;
      let zoomedHeight = height / zoom;
      let sx = (width - zoomedWidth) / 2;
      let sy = (height - zoomedHeight) / 2;
      let sw = zoomedWidth;
      let sh = zoomedHeight;
      let dx = 0;
      let dy = 0;
      let dw = width;
      let dh = height;

      this.ctx.drawImage(this.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    this.iframe.focus();

    this.colorPreview.style.backgroundColor = this.centerColor.hex;
    this.populateColorValues();

    if (this.zoomWindow.zoom > 2) {
      // grid at 2x is too busy
      this.drawGrid();
    }
    this.drawCrosshair();
  },

  drawGrid: function() {
    let { width, height, zoom } = this.zoomWindow;

    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = "rgba(0, 0, 0, .05)";

    for (let i = 0; i < width; i += this.cellSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(i - .5, 0);
      this.ctx.lineTo(i - .5, height);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, i - .5);
      this.ctx.lineTo(width, i - .5);
      this.ctx.stroke();
    }
  },

  drawCrosshair: function() {
    let x = y = this.centerCell * this.cellSize;

    this.ctx.lineWidth = 1;
    this.ctx.lineJoin = 'miter';
    this.ctx.strokeStyle = "rgba(0, 0, 0, 1)";
    this.ctx.strokeRect(x - 1.5, y - 1.5, this.cellSize + 2, this.cellSize + 2);

    this.ctx.strokeStyle = "rgba(255, 255, 255, 1)";
    this.ctx.strokeRect(x - 0.5, y - 0.5, this.cellSize, this.cellSize);
  },

  populateColorValues: function() {
    let color = this.centerColor;

    for (let format of ["rgb", "hsl", "hex"]) {
      let item = this.iframeDocument.getElementById(format + "-value");
      item.value = item.label = color[format];
    }

    this.colorValues.value = color[this.format];
  }
}