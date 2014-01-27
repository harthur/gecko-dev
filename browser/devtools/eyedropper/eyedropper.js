const {Cc, Ci, Cu} = require("chrome");

Cu.import("resource://gre/modules/Services.jsm");

const {colorUtils} = require("devtools/css-color");
const CssColor = colorUtils.CssColor;
let EventEmitter = require("devtools/shared/event-emitter");

loader.lazyGetter(this, "clipboardHelper", function() {
  return Cc["@mozilla.org/widget/clipboardhelper;1"].
    getService(Ci.nsIClipboardHelper);
});

const MAGNIFIER_URL = "chrome://browser/content/devtools/eyedropper.xul";
const ZOOM_PREF = "devtools.eyedropper.zoom";
const FORMAT_PREF = "devtools.defaultColorUnit";

const PANEL_STYLE = "width:96px;height:114px;" +
                   "-moz-appearance:none;background-color:transparent";
const CANVAS_WIDTH = 96;
const CLOSE_DELAY = 750;

/**
 * Eyedropper widget. Once opened, shows zoomed area above current pixel and
 * displays the color value of the center pixel.
 *
 * let eyedropper = new Eyedropper(window);
 * maginifier.open();
 */

function Eyedropper(chromeWindow, opts = { copyOnSelect: true }) {
  const { copyOnSelect } = opts;
  this.onFirstMouseMove = this.onFirstMouseMove.bind(this);
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

  this.format = Services.prefs.getCharPref(FORMAT_PREF);
  this.copyOnSelect = copyOnSelect;

  EventEmitter.decorate(this);
}

exports.Eyedropper = Eyedropper;

Eyedropper.prototype = {
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

  /**
   * Show the eyedropper.
   */
  open: function() {
    this.chromeDocument.addEventListener("mousemove", this.onFirstMouseMove);

    this.addListeners();
  },

  onFirstMouseMove: function(event) {
    this.chromeDocument.removeEventListener("mousemove", this.onFirstMouseMove);

    this._panel = this.buildPanel();
    this.popupSet.appendChild(this._panel);

    this._panel.openPopupAtScreen(event.screenX, event.screenY);
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
    panel.id = "devtools-eyedropper-indication-panel";
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

    let iframe = this.iframe = this.chromeDocument.createElement("iframe");
    iframe.addEventListener("load", this.frameLoaded.bind(this), true);
    iframe.setAttribute("flex", "1");
    iframe.setAttribute("transparent", "transparent");
    iframe.setAttribute("allowTransparency", true);
    iframe.setAttribute("class", "devtools-eyedropper-iframe");
    iframe.setAttribute("src", MAGNIFIER_URL);
    iframe.setAttribute("width", CANVAS_WIDTH);
    iframe.setAttribute("height", CANVAS_WIDTH);

    panel.appendChild(iframe);

    return panel;
  },

  frameLoaded: function() {
    this.iframeDocument = this.iframe.contentDocument;
    this.canvas = this.iframeDocument.querySelector("#canvas");
    this.ctx = this.canvas.getContext("2d");
    this.canvasContainer = this.iframeDocument.querySelector("#canvas-container")
    this.colorPreview = this.iframeDocument.querySelector("#color-preview");
    this.colorValue = this.iframeDocument.querySelector("#color-value");

    this.zoomWindow.width = this.canvas.width;
    this.zoomWindow.height = this.canvas.height;

    this.addPanelListeners();

    this.drawWindow();
  },

  addPanelListeners: function() {
    this.canvas.addEventListener("click", this.onMouseDown);
    this.iframe.contentWindow.addEventListener("click", this.onMouseDown);

    this.iframeDocument.addEventListener("keydown", this.onKeyDown);

    let closeCmd = this.iframeDocument.getElementById("eyedropper-cmd-close");
    closeCmd.addEventListener("command", this.destroy.bind(this), true);

    let copyCmd = this.iframeDocument.getElementById("eyedropper-cmd-copy");
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

  moveRegion: function(x, y) {
    this.zoomWindow.x = x;
    this.zoomWindow.y = y;

    this.drawWindow();
  },

  onMouseDown: function(event) {
    this.toggleDragging(false);

    event.preventDefault();
    event.stopPropagation();

    this.selectColor();
  },

  selectColor: function() {
    this.emit("select", this.colorValue.value);

    if (this.copyOnSelect) {
      this.copyColor(this.destroy.bind(this));
    }
    else {
      this.destroy();
    }
  },

  copyColor: function(callback) {
    Services.appShell.hiddenDOMWindow.clearTimeout(this.copyTimeout);
    clipboardHelper.copyString(this.colorValue.value);

    this.colorValue.classList.add("highlight");

    this.copyTimeout = Services.appShell.hiddenDOMWindow.setTimeout(() => {
      this.colorValue.classList.remove("highlight");
      if (callback) {
        callback();
      }
    }, CLOSE_DELAY);
  },

  onKeyDown: function(event) {
    if (event.metaKey && event.keyCode === event.DOM_VK_C) {
      this.copyColor();
      return;
    }

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
    this.colorValue.value = color[this.format];
  }
}