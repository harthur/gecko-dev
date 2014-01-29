/* vim: set ts=2 et sw=2 tw=80: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const TESTCASE_URI = TEST_BASE + "color-block.html";

const Cc = Components.classes;
const Ci = Components.interfaces;

const DIV_COLOR = "#00F";

function test()
{
  waitForExplicitFinish();

  addTab(TESTCASE_URI, runTests);
}

function runTests() {
  let dropper = new Eyedropper(window);

  dropper.once("select", (event, color) => {
    is(color, DIV_COLOR, "correct color selected");
  });

  waitForClipboard(DIV_COLOR, () => {
    inspectPage(dropper);
  }, finish, finish);
}

function inspectPage(dropper) {
  dropper.open();

  let target = content.document.getElementById("test");
  let win = content.window;

  EventUtils.synthesizeMouse(target, 20, 20, { type: "mousemove" }, win);

  dropperLoaded(dropper).then(() => {
    EventUtils.synthesizeMouse(target, 30, 30, { type: "mousemove" }, win);
    EventUtils.synthesizeMouse(target, 30, 30, {}, win);
  });
}

function dropperLoaded(dropper) {
  if (dropper.loaded) {
    return promise.resolve();
  }

  let deferred = promise.defer();
  dropper.once("load", deferred.resolve);

  return deferred.promise;
}
