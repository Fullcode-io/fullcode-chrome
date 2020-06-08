console.warn('hello content script!')

let stackTraceScript = document.createElement('script');
let jsonPruneScript = document.createElement('script');
stackTraceScript.src = chrome.extension.getURL('lib/stacktrace-js.js');
jsonPruneScript.src = chrome.extension.getURL('lib/json-prune.js');
(document.head || document.documentElement).appendChild(stackTraceScript);
(document.head || document.documentElement).appendChild(jsonPruneScript)

function codeToInject() {

  async function handleError(err, id) {
    if (err) {
      let timestamp = Date.now()
      err = err.error || err
      let stack = await StackTrace.fromError(err).catch(e => console.warn(e, false))
      id = id || 'error'
      var data = { stack , message: err.message }
      window.postMessage({_FC_id: id, data, timestamp}, "*");
      // window.postMessage(data, "*");

    }
  }

  function sendMessage(msg) {
    try {
      msg.data.args = JSON.prune(msg.data.args)
      // debugger;
      // console.log('sending message: ', msg)
      window.postMessage(msg, "*")
    } catch (e) {
      handleError(e, 'internal_error')
    }
  }

  let newConsole = (function(oldCons){
    let newConsObject = {}
    Object.entries(oldCons).forEach(([key, value]) => {
      newConsObject[key] = value
    })
    newConsObject.error = function (err) {
      handleError(err)
      oldCons.error.apply(oldCons, arguments)
    }
    newConsObject.log = function () {
      let timestamp = Date.now()
      oldCons.log.apply(oldCons, arguments)
      let data = {args: arguments}
      sendMessage({_FC_id: "log", data, timestamp})
    }
    newConsObject.warn = function (args) {
      let timestamp = Date.now()
      let data = {args: arguments}
      sendMessage({_FC_id: "warn", data, timestamp})
      oldCons.warn.apply(oldCons, arguments)
    }
    return newConsObject
  }(window.console))


  window.console = newConsole

  window.addEventListener('error', handleError)

  window.addEventListener('unhandledrejection', function(e) {
    if (typeof e.reason === 'undefined') {
      e.reason = e.detail;
    }
    handleError(e.reason)
  })

}

stackTraceScript.onload = (() => {
    // window.console.warn('removed stacktrace from dom')
    let listener = document.createElement('script');
    listener.textContent = '(' + codeToInject + '())';
    (document.head || document.documentElement).appendChild(listener);
    stackTraceScript.parentNode.removeChild(stackTraceScript);
    listener.parentNode.removeChild(listener);
})
jsonPruneScript.onload = (() => {
    // window.console.warn('removed stacktrace from dom')
    jsonPruneScript.parentNode.removeChild(jsonPruneScript);
})

let port = chrome.runtime.connect({name: "_FC_extension"})

window.addEventListener("message", function(msg) {
    // We only accept messages from ourselves
    msg.data = msg.data || {}
    if (msg.source != window || !msg.data._FC_id) {
      return
    }
    let timestamp = msg.data.timestamp
    delete msg.data.timestamp
    // debugger
    // port.postMessage({data: msg.data})
    port.postMessage({_FC_id: msg.data._FC_id, data: msg.data, timestamp })
})

console.log('goodbye content script!')
// debugger;
