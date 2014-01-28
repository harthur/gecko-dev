/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_BASE = "chrome://mochitests/content/browser/browser/devtools/eyedropper/test/";
const TEST_HOST = 'mochi.test:8888';


function cleanup()
{
  while (gBrowser.tabs.length > 1) {
    gBrowser.removeCurrentTab();
  }
}

registerCleanupFunction(cleanup);

// let tempScope = {};
// Cu.import("resource://gre/modules/devtools/Loader.jsm", tempScope);
// let TargetFactory = tempScope.devtools.TargetFactory;
