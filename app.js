'use strict';

const $ = (id) => document.getElementById(id);
const modeSelect = $('mode');
const genderSelect = $('gender');
const roleSelect = $('role');
const whoStartsSelect = $('whoStarts');
const startCallBtn = $('startCall');
const callStatus = $('callStatus');
const micStatus = $('micStatus');
const micIndicator = $('micIndicator');
const transcriptBox = $('transcript');
const prospectName = $('prospectName');
const prospectRole = $('prospectRole');
const avatar = $('avatar');

const prospects = {
  it: { name: 'Sarah Williams', role: 'IT Director', avatar: '👩🏻‍💼', greeting: 'Hello, Sarah Williams speaking. Who is calling, please?', open: 'Hello, this is Sarah Williams, IT Director. I have a moment. What is the call regarding?' },
  dc: { name: 'James Parker', role: 'Data Centre Manager', avatar: '👨🏻‍💼', greeting: 'Hello, James Parker speaking. How can I help?', open: 'Hello, James Parker here, Data Centre Manager. I am between meetings, so what can I help you with?' },
  procurement: { name: 'Emily Carter', role: 'Procurement Manager', avatar: '👩🏼‍💼', greeting: 'Good morning, Emily Carter speaking. Who am I speaking with?', open: 'Hello, this is Emily Carter in Procurement. Could you briefly explain the reason for your call?' },
  cto: { name: 'David Mitchell', role: 'Chief Technology Officer', avatar: '👨🏼‍💼', greeting: 'Hello, David Mitchell speaking. What can I do for you?', open: 'Hello, David Mitchell here, CTO. I have a few minutes. What would you like to discuss?' }
};

let callActive = false;
let recognition = null;
let listening = false;
let processingTurn = false;
let finalTranscript = '';
let pendingUserText = '';
let silenceTimer = null;
let currentUtterance = null;
let chosenVoice = null;
let recognitionSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
let voiceList = [];

function setCallStatus(message) { callStatus.textContent = message; }
function setMicStatus(message, state = '') {
  micStatus.textContent = message;
  micIndicator.className = `mic-indicator${state ? ` ${state}` : ''}`;
}
function selectedProspect() { return prospects[roleSelect.value] || prospects.it; }
function refreshProspectCard() {
  const prospect = selectedProspect();
  prospectName.textContent = prospect.name;
  prospectRole.textContent = `${prospect.role} · United Kingdom`;
  avatar.textContent = prospect.avatar;
}
function renderTranscript() {
  if (!finalTranscript.trim()) {
    transcriptBox.innerHTML = '<span class="placeholder">Your conversation will appear here…</span>';
    return;
  }
  transcriptBox.textContent = finalTranscript.trim();
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}
function addTranscript(speaker, words) {
  if (!words || !words.trim()) return;
  finalTranscript += `${finalTranscript ? '\n\n' : ''}${speaker}: ${words.trim()}`;
  renderTranscript();
}
function loadVoices() {
  voiceList = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const british = voiceList.filter(v => /^en-GB/i.test(v.lang));
  const preferredGender = genderSelect.value;
  const genderMatch = british.filter(v => preferredGender === 'female'
    ? /female|serena|kate|susan|hazel|libby|sonia|amy/i.test(v.name)
    : /male|daniel|george|ryan|arthur|oliver|thomas/i.test(v.name));
  chosenVoice = genderMatch[0] || british[0] || voiceList.find(v => /^en/i.test(v.lang)) || null;
  $('voiceInfo').textContent = chosenVoice
    ? `Using browser voice: ${chosenVoice.name} (${chosenVoice.lang}).`
    : 'No British English voice was found. Your browser default voice may be used.';
}
function speakProspect(text, afterSpeech) {
  if (!callActive || !window.speechSynthesis) {
    if (callActive && typeof afterSpeech === 'function') afterSpeech();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  chosenVoice = chosenVoice || (window.speechSynthesis.getVoices().find(v => /^en-GB/i.test(v.lang)) || null);
  if (chosenVoice) {
    utterance.voice = chosenVoice;
    utterance.lang = chosenVoice.lang || 'en-GB';
  } else {
    utterance.lang = 'en-GB';
  }
  utterance.rate = modeSelect.value === 'easy' ? 0.91 : modeSelect.value === 'hard' ? 1.04 : 0.98;
  utterance.pitch = genderSelect.value === 'female' ? 1.08 : 0.91;
  currentUtterance = utterance;
  utterance.onstart = () => {
    processingTurn = true;
    setCallStatus('Prospect is speaking…');
    setMicStatus('Please listen to the prospect.', 'speaking');
  };
  utterance.onend = () => {
    processingTurn = false;
    if (!callActive) return;
    if (typeof afterSpeech === 'function') afterSpeech();
  };
  utterance.onerror = () => {
    processingTurn = false;
    if (callActive && typeof afterSpeech === 'function') afterSpeech();
  };
  window.speechSynthesis.speak(utterance);
}
function getProspectReply(words) {
  const text = words.toLowerCase();
  const mode = modeSelect.value;
  const role = roleSelect.value;
  const roleFollowUp = {
    it: 'How would your service fit with our existing IT infrastructure and security requirements?',
    dc: 'What availability, resilience and support arrangements can you provide?',
    procurement: 'Could you explain the pricing, contract terms and expected commercial benefit?',
    cto: 'What measurable business or technical advantage would this give us over our current setup?'
  }[role];

  if (/\b(hello|hi|good morning|good afternoon|how are you)\b/.test(text)) {
    return mode === 'hard'
      ? 'Hello. I am quite busy today. Could you get to the point and tell me why you are calling?'
      : 'Hello, thank you for calling. Could you briefly tell me who you are and why you are calling?';
  }
  if (/\b(not interested|no thanks|not looking|not required|we're fine|we are fine)\b/.test(text)) {
    return mode === 'easy'
      ? 'I understand. What would make a data centre supplier worth considering for us in the future?'
      : 'Understood. We already have arrangements in place, so what makes your offer different?';
  }
  if (/\b(price|pricing|cost|expensive|budget|quote|cheaper)\b/.test(text)) {
    return 'Cost is important to us. What drives your pricing, and how would you demonstrate value compared with our current provider?';
  }
  if (/\b(colocation|co-location|data ?cent(re|er)|rack space|hosting|server|cloud|disaster recovery|connectivity)\b/.test(text)) {
    return roleFollowUp;
  }
  if (/\b(meeting|calendar|appointment|demo|demonstration|book a call)\b/.test(text)) {
    return mode === 'hard'
      ? 'I do not usually agree to meetings on a cold call. What exactly would we get out of it?'
      : 'Possibly. What would you want to cover, and how much time would you need?';
  }
  if (/\b(email|send (me )?(some )?(information|details)|send it over|follow up)\b/.test(text)) {
    return 'You can send something over. To make it useful, what specific information would you include for a business like ours?';
  }
  if (/\b(current provider|existing supplier|already have|contract|renewal)\b/.test(text)) {
    return 'We do have an existing provider. What would be the main reason for us to review our current arrangement?';
  }
  if (/\b(reliable|uptime|resilien|security|compliance|power|cooling|support|sla)\b/.test(text)) {
    return `Those are important considerations for us. ${roleFollowUp}`;
  }
  if (/\b(questions|understand your needs|requirements|challenge|problem|pain point)\b/.test(text)) {
    return 'Our priorities are reliability, predictable costs and responsive support. How would you find out whether we are a good fit for your service?';
  }
  if (/\b(thank you|thanks|appreciate)\b/.test(text)) {
    return 'Thank you. Before we finish, what would be the next step and what would you need from me?';
  }
  if (mode === 'easy') return 'That is helpful. Could you explain a little more about the benefit for our business?';
  if (mode === 'hard') return 'I am not convinced yet. Why should we consider changing anything, and what evidence can you give me?';
  return `I see. Could you explain how that would help with our requirements? ${roleFollowUp}`;
}
function stopRecognitionForReply() {
  if (!recognition || !listening) return;
  try { recognition.stop(); } catch (_) { /* It may already be stopping. */ }
}
function createRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const instance = new SpeechRecognition();
  instance.lang = 'en-GB';
  instance.continuous = true;
  instance.interimResults = true;
  instance.maxAlternatives = 1;
  instance.onstart = () => {
    listening = true;
    pendingUserText = '';
    setMicStatus('Listening — speak now.', 'listening');
    setCallStatus('Your turn — speak naturally.');
  };
  instance.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const words = result[0] && result[0].transcript ? result[0].transcript.trim() : '';
      if (!words) continue;
      if (result.isFinal) {
        // Recognition can report the same final segment only once per result index.
        pendingUserText += `${pendingUserText ? ' ' : ''}${words}`;
      } else {
        interim += `${interim ? ' ' : ''}${words}`;
      }
    }
    renderTranscriptWithInterim(interim);
    if (pendingUserText) {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => stopRecognitionForReply(), 1250);
    }
  };
  instance.onerror = (event) => {
    if (!callActive) return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setMicStatus('Microphone permission was blocked. Allow microphone access in your browser settings.', '');
      setCallStatus('Microphone access is needed for spoken practice.');
    } else if (event.error === 'audio-capture') {
      setMicStatus('No microphone was detected. Check your microphone and try again.');
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      setMicStatus(`Speech recognition issue: ${event.error}. Try starting the call again.`);
    }
  };
  instance.onend = () => {
    listening = false;
    clearTimeout(silenceTimer);
    renderTranscript();
    if (!callActive) return;
    const spokenWords = pendingUserText.trim();
    pendingUserText = '';
    if (spokenWords) {
      addTranscript('You', spokenWords);
      const reply = getProspectReply(spokenWords);
      addTranscript(selectedProspect().name, reply);
      speakProspect(reply, () => startListening());
    } else if (!processingTurn) {
      setMicStatus('Listening stopped. You can speak again or end the call.');
      setCallStatus('Your turn — speak when ready.');
      // Restart after a short pause if recognition ended without detecting speech.
      setTimeout(() => { if (callActive && !listening && !processingTurn) startListening(); }, 450);
    }
  };
  return instance;
}
function renderTranscriptWithInterim(interim) {
  renderTranscript();
  if (!interim) return;
  const interimLine = document.createElement('div');
  interimLine.className = 'interim-line';
  interimLine.textContent = `You (hearing): ${interim}`;
  transcriptBox.appendChild(interimLine);
  transcriptBox.scrollTop = transcriptBox.scrollHeight;
}
async function startListening() {
  if (!callActive || listening || processingTurn) return;
  if (!recognitionSupported) {
    setMicStatus('Speech recognition is not supported in this browser. Try Google Chrome or Microsoft Edge.');
    setCallStatus('Use Chrome or Edge for microphone transcription.');
    return;
  }
  if (!recognition) recognition = createRecognition();
  try {
    // Trigger the browser permission prompt on the user's action if needed.
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    }
    if (!callActive || listening) return;
    recognition.start();
  } catch (error) {
    if (error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
      setMicStatus('Microphone permission denied. Allow access in the browser address bar and try again.');
    } else if (error && error.name === 'NotFoundError') {
      setMicStatus('No microphone found. Connect a microphone and try again.');
    } else {
      // InvalidStateError can occur during a rapid browser restart; onend will settle it.
      setMicStatus('Could not start the microphone. Check browser permissions and try again.');
    }
  }
}
function startCall() {
  if (callActive) {
    endCall();
    return;
  }
  if (!window.speechSynthesis) {
    setCallStatus('Speech playback is not supported in this browser. Try Chrome or Edge.');
    return;
  }
  callActive = true;
  finalTranscript = '';
  pendingUserText = '';
  renderTranscript();
  startCallBtn.textContent = '■ End Call';
  startCallBtn.classList.add('is-active');
  modeSelect.disabled = genderSelect.disabled = roleSelect.disabled = whoStartsSelect.disabled = true;
  refreshProspectCard();
  loadVoices();
  const prospect = selectedProspect();
  if (whoStartsSelect.value === 'client') {
    addTranscript(prospect.name, prospect.greeting);
    speakProspect(prospect.greeting, () => startListening());
  } else {
    setCallStatus('Call started. Introduce yourself when you hear the tone of the conversation.');
    startListening();
  }
}
function endCall() {
  callActive = false;
  listening = false;
  processingTurn = false;
  clearTimeout(silenceTimer);
  if (recognition) {
    try { recognition.onend = null; recognition.onerror = null; recognition.stop(); } catch (_) { /* Ignore if already stopped. */ }
    recognition = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  currentUtterance = null;
  pendingUserText = '';
  startCallBtn.textContent = '☎ Start Call';
  startCallBtn.classList.remove('is-active');
  modeSelect.disabled = genderSelect.disabled = roleSelect.disabled = whoStartsSelect.disabled = false;
  setCallStatus('Call ended. Start another call whenever you are ready.');
  setMicStatus('Microphone is off.');
}

startCallBtn.addEventListener('click', startCall);
$('clearTranscriptBtn').addEventListener('click', () => {
  finalTranscript = '';
  pendingUserText = '';
  renderTranscript();
});
roleSelect.addEventListener('change', refreshProspectCard);
genderSelect.addEventListener('change', loadVoices);
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
refreshProspectCard();
