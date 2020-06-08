const config = {
  apiKey: 'AIzaSyAUnA-O2lHkwqoOy3tAkQnBcRgUgDpvUH0',
  authDomain: 'nighthawk-1.firebaseapp.com',
  databaseURL: 'https://nighthawk-1.firebaseio.com',
  storageBucket: 'nighthawk-1.appspot.com',
}

// this file will run once on extension load
// var config = {
//   apiKey: "[insert api key]",
//   authDomain: "[insert auth domain]",
//   databaseURL: "[insert database url]",
//   storageBucket: "[insert storage bucket]",
//   projectId: "[insert project id]",
//   messagingSenderId: "[insert message sender id]"
// }
// const app = firebase.initializeApp(config)
// const db = app.database().ref()
var app = null
var db = null
var consoleMessages = []
var user = null
var lastSave = {}


// instantiate global application state object for Chrome Storage and feed in firebase data
// Chrome Storage will store our global state as a a JSON stringified value.

const applicationState = { values: [] }


function initApp() {
  console.log('initApp of background.js')
  app = app || firebase.initializeApp(config)
  db = db || app.database()
  // Listen for auth state changes.
  firebase.auth().onAuthStateChanged(function(authUser) {
    user = authUser
    if (authUser) {
      setupListeners()
    }
    else if (user) {
      db.off()
      // turnOffListeners()
    }
    console.log('background.js user changed:', user);
  })
}

function setupListeners() {
  console.log(`setting up listner: last_saves/${user.uid}`)
  db.ref(`last_saves/${user.uid}`).on('value', function(snap) {
    lastSave = snap.val() || lastSave
    console.log('lastSave', lastSave)
  })

  // let userAuthData = app.database().ref(`auth_data/${user.uid}`)
  // let authData = null
  // userAuthData.on('value', async (snap) => {
  //   let authData = snap.val() || {}
  //   // trackedProjects = authData.trackedProjects || []
  //   authData = authData || {}
  //   // trackedProjects = Object.values(projects).filter(project => project.isTracked)
  //   // updateWorkers()
  //   console.log('auth data: ', authData)
  // })
}

// function turnOffListeners() {
//   console.log('turning off listeners')
//   db.off()
// }

// db.on('child_removed', snapshot => {
//   const childPosition = getChildIndex(applicationState, snapshot.key)
//   if (childPosition === -1) return
//   applicationState.values.splice(childPosition, 1)
//   updateState(applicationState)
// })

// db.on('child_changed', snapshot => {
//   const childPosition = getChildIndex(applicationState, snapshot.key)
//   if (childPosition === -1) return
//   applicationState.values[childPosition] = snapshot.val()
//   updateState(applicationState)
// })



// updateState is a function that writes the changes to Chrome Storage
function updateState(applicationState) {
  chrome.storage.local.set({ state: JSON.stringify(applicationState) })
}

// getChildIndex will return the matching element in the object
function getChildIndex(appState, id) {
  return appState.values.findIndex(element => element.id == id)
}

// if your Chrome Extension requires any content scripts that will manipulate data,
// add a message listener here to access db:

chrome.runtime.onMessageExternal.addListener((msg, sender, response) => {
  console.log('recieved message: ', msg)
  console.log('sender: ', sender)
  if (msg.user && !window.localStorage.length) {
    // https://github.com/firebase/firebase-js-sdk/issues/49
    window.localStorage.setItem(
      `firebase:authUser:${config.apiKey}:[DEFAULT]`,
      JSON.stringify(msg.user)
    );
    initApp()
    response('success!')
  }
  else if (msg.user) {
    initApp()
  }
})

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name == "_FC_extension") {
    port.onMessage.addListener(function(msg) {
      // console.log(msg)
      // message payloads always comes in under 'data' property...
      // inside this data prop we have our own props: {_FC_id, data, timestamp}

      consoleMessages.push(msg)
      // push all lines into sendMessages to sort later then move this logic there
      // get last message
      // if lastMsg === newMSG
          // increment lastMSG count
        // else
          // push lastMSG to consoleMessages
          // set lastMsg = newMSG

      // arbitrary flush threshold
      if (consoleMessages.length >= 5000) {
        // sendLogs.flush()
        sendMessages(true)
      }
      else {
        sendMessages()
      }
    })
  }
});

const sendMessages = debounce( async () => {
  // let lastMessageData = JSON.parse(lastMessageKey)
  // let count = lastMessageCounter
  // let timestamp = lastMessageTimestamp
  // consoleMessages.push({data: lastMessageData, count, timestamp})
  console.log('batching messages')
  console.log(consoleMessages.length)

  let lastMessageKey = null
  let lastMessageCounter = 0
  let lastMessageTimestamp = null
  let groupedConsoleMessages = []

  let sortedConsoleMessages = consoleMessages.sort((a,b) => {
    return a.timestamp - b.timestamp
  })

  sortedConsoleMessages.forEach((msg, i, allMsgs) => {
    let newMessageKey = JSON.stringify(msg.data.data)
    if (lastMessageKey && lastMessageKey !== newMessageKey) {
      let lastMessageData = JSON.parse(lastMessageKey)
      let count = lastMessageCounter
      let timestamp = lastMessageTimestamp
      let type = allMsgs[i - 1]._FC_id
      groupedConsoleMessages.push({data: lastMessageData, count, timestamp, type})
      lastMessageCounter = 0
    }
    lastMessageKey = newMessageKey
    lastMessageTimestamp = msg.timestamp
    lastMessageCounter = lastMessageCounter + 1
  })
  // this handles edge case for last grouping
  let lastMessageData = JSON.parse(lastMessageKey)
  let count = lastMessageCounter
  let timestamp = lastMessageTimestamp
  let type = sortedConsoleMessages.pop()._FC_id
  groupedConsoleMessages.push({data: lastMessageData, count, timestamp, type})
  console.log(groupedConsoleMessages)



  // let trackedProjects = clientInfo.authData.trackedProjects
  let payload = { messages: groupedConsoleMessages };
  // let payloadProjects = payload.projects;
  // let logPathGroups = {};
  // console.log(`projects: ${Object.keys(payloadProjects).length} lines: ${lines.length}`)
  // // sendMessage(payloadProjects)
  fetch(`http://localhost:8010/nighthawk-1/us-central1/auth/console-event`,
  // fetch(`https://us-central1-nighthawk-1.cloudfunctions.net/auth/log-event`,
  { method: 'POST',
    headers:
    {
      'Authorization': `Bearer ${await user.getIdToken().catch(e => console.error(e))}`,
      'Content-Type': 'text/plain',
      'Refresh-Token': `${user.refreshToken}`
    },
    body: JSON.stringify(payload),
  }).then(async resp => console.log(await resp.json()))
  .catch(err => console.log({err}))
  // startTime = null;
  consoleMessages.length = 0
  
  // lastMessageKey = null
  // lastMessageCounter = 0
  // lastMessageTimestamp = null
}, 3000)

function debounce(func, wait, immediate) {
  var timeout;

  return function executedFunction() {
    var context = this;
    var args = arguments;

    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };

    var callNow = immediate && !timeout;

    clearTimeout(timeout);

    timeout = setTimeout(later, wait);

    if (callNow) func.apply(context, args);
  };
};

window.onload = function() {
  // initApp()
};
