// account 1
// const AZURE_TRANSLATOR_API_KEY = '1fa1772cb23d42d6a5b84cb94c006dd3';
// const AZURE_TRANSLATOR_API_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/';
// const AZURE_TRANSLATOR_API_REGION = 'eastus';

// account 2
const AZURE_TRANSLATOR_API_KEY = '35d77e3b9e364a4f84f1bf0e49b5bba6';
const AZURE_TRANSLATOR_API_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/';
const AZURE_TRANSLATOR_API_REGION = 'eastus';

const CHANNEL_ID = '7Pms31vn53VkwWTz';

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messages = document.getElementById('messages');

let videoDeviceId;
let localStream;


const drone = new Scaledrone(CHANNEL_ID);

const roomName = 'observable-' + (location.hash.substring(1) || 'public');
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;

function onSuccess() {};

function onError(error) {
  console.error(error);
};

drone.on('open', error => {
  if (error) return console.error(error);
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) onError(error);
  });
  room.on('members', members => {
    const isOfferer = members.length > 1;
    startWebRTC(isOfferer);
  });
  room.on('member_leave', ({
    id
  }) => {
    console.log('Member left', id);
  });

  room.on('data', (data, member) => {
    if (member && member.id !== drone.clientId) {
      receivedMessage(data, false);
    }
  });


});

function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}


function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({
        'candidate': event.candidate
      });
    }
  };

  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  pc.ontrack = event => {
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  getStream()
    .then(stream => {
      localStream = stream;
      localVideo.srcObject = localStream;
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    })
    .catch(onError);

  room.on('data', (message, client) => {
    if (!client || client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}


function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({
      'sdp': pc.localDescription
    }),
    onError
  );
}


// async function receivedMessage(message, isSentByMe) {
//   const el = document.createElement('div');
//   const language = document.getElementById('language').value;
//   const detectedLanguage = await detectLanguage(message);
//   const shouldTranslate = detectedLanguage !== language;
//   const translatedMessage = shouldTranslate ? await translateMessage(message, language) : message;
//
//   if (isSentByMe) {
//     el.innerHTML = `<strong>ME:</strong> <span>${translatedMessage}</span>`;
//     el.classList.add('sent-message');
//   } else {
//     el.innerHTML = `<strong>FRND:</strong> <span>${translatedMessage}</span>`;
//     el.classList.add('received-message');
//     if (shouldTranslate) {
//       const originalTextEl = document.createElement('span');
//       originalTextEl.classList.add('original-text');
//       originalTextEl.innerHTML = `Original: ${message}`;
//       el.appendChild(originalTextEl);
//     }
//   }
//
//   messages.appendChild(el);
//   messages.scrollTop = messages.scrollHeight;
// }
async function receivedMessage(message, isSentByMe) {
  const el = document.createElement('div');
  const language = document.getElementById('language').value;

  if (isSentByMe) {
    el.innerHTML = `<strong>ME:</strong> <span>${message}</span>`;
    el.classList.add('sent-message');
  } else {
    const detectedLanguage = await detectLanguage(message);
    const shouldTranslate = detectedLanguage !== language;
    const translatedMessage = shouldTranslate ? await translateMessage(message, language) : message;

    el.innerHTML = `<strong>FRND:</strong> <span>${translatedMessage}</span>`;
    el.classList.add('received-message');
    if (shouldTranslate) {
      const originalTextEl = document.createElement('span');
      originalTextEl.classList.add('original-text');
      originalTextEl.innerHTML = `Original: ${message}`;
      el.appendChild(originalTextEl);
    }
  }

  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}






messageForm.addEventListener('submit', event => {
  event.preventDefault();
  const message = messageInput.value;
  if (!message) {
    return;
  }
  sendMessage(message);
  //receivedMessage(message, true);
  // const language = document.getElementById('language').value;
  // translateMessage(message, language).then(translatedMessage => {
  //   receivedMessage(translatedMessage, true);
  //   messageInput.value = '';
  // });
receivedMessage(message, true);


  messageInput.value = '';
});




async function translateMessage(text, targetLanguage) {
  const detectedLanguage = await detectLanguage(text);

  if (detectedLanguage === targetLanguage) {
    return text; // No need to translate if the detected language is the same as the target language
  }

  const url = `${AZURE_TRANSLATOR_API_ENDPOINT}/translate?api-version=3.0&to=${targetLanguage}`;

  const body = [{
    text: text
  }];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_API_KEY,
      'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_API_REGION

    },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (result.error) {
    console.error('Error translating message:', result.error);
    return text;
  }

  return result[0].translations[0].text;
}

async function detectLanguage(text) {
  const url = `${AZURE_TRANSLATOR_API_ENDPOINT}/detect?api-version=3.0`;

  const body = [{
    text: text
  }];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_API_KEY,
      'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_API_REGION
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (result.error) {
    console.error('Error detecting language:', result.error);
    return 'en'; // Default to English if an error occurs
  }

  return result[0].language;
}




let isVideoOff = false;



async function switchCamera() {
  // Get all video devices
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');

  // Find the index of the current video device
  const currentDeviceIndex = videoDevices.findIndex(device => device.deviceId === videoDeviceId);

  // Determine the new video device
  const newDevice = videoDevices[(currentDeviceIndex + 1) % videoDevices.length];

  // Update the video device ID
  videoDeviceId = newDevice.deviceId;

  // Stop the old video tracks
  localStream.getVideoTracks().forEach(track => track.stop());

  // Get the new video stream
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { deviceId: videoDeviceId },
  });

  // Update the local video stream
  localVideo.srcObject = newStream;

  // Get the video track from the new stream
  const newVideoTrack = newStream.getVideoTracks()[0];

  // Replace the video track in the RTCPeerConnection
  const sender = pc.getSenders().find(sender => sender.track.kind === 'video');
  sender.replaceTrack(newVideoTrack);

  // Update the local stream
  localStream = newStream;
}






let isMuted = false;

function toggleMute() {
  if (!localStream) {
    return;
  }

  localStream.getAudioTracks().forEach(track => {
    track.enabled = isMuted;
  });

  isMuted = !isMuted;

  const muteImage = document.getElementById('mute-switch');
  muteImage.src = isMuted ? 'images/mic-muted.png' : 'images/mic.png';
  muteImage.alt = isMuted ? 'Unmute' : 'Mute';
}


// async function getStream(audioEnabled = true) {
//   const constraints = {
//     audio: audioEnabled,
//     video: videoDeviceId ? { deviceId: videoDeviceId } : true
//   };
//
//   localStream = await navigator.mediaDevices.getUserMedia(constraints);
//
//   // Update videoDeviceId with the current video device
//   const currentVideoTrack = localStream.getVideoTracks()[0];
//   videoDeviceId = currentVideoTrack.getSettings().deviceId;
//
//   return localStream;
// }

async function getStream(audioEnabled = true) {
  const constraints = {
    audio: audioEnabled,
    video: videoDeviceId ? { deviceId: videoDeviceId } : true
  };

  localStream = await navigator.mediaDevices.getUserMedia(constraints);

  // Update videoDeviceId with the current video device
  const currentVideoTrack = localStream.getVideoTracks()[0];
  videoDeviceId = currentVideoTrack.getSettings().deviceId;

  return localStream;
}





async function replaceStream(newStream) {
  const oldStream = localStream;
  localStream = newStream;
  localVideo.srcObject = localStream;

  if (!pc) {
    return;
  }

  const senders = pc.getSenders();

  newStream.getTracks().forEach(track => {
    const sender = senders.find(s => s.track && s.track.kind === track.kind);
    if (sender) {
      sender.replaceTrack(track);
    } else {
      pc.addTrack(track, newStream);
    }
  });

  oldStream.getTracks().forEach(track => track.stop());
}




// Test
async function testTranslationAPI() {
  const testText = 'This is just a test to see if this works...';
  const targetLanguage = 'es'; // Change to a different language code if needed

  try {
    const translatedText = await translateMessage(testText, targetLanguage);
    console.log(`Translation test result: '${testText}' translated to '${translatedText}'`);
  } catch (error) {
    console.error('Error testing translation API:', error);
  }
}

testTranslationAPI();
