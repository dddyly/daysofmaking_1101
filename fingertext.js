import DeviceDetector from "https://cdn.skypack.dev/device-detector-js@2.2.10";
const mpHands = window;
const drawingUtils = window;

// Browser compatibility check
testSupport([
    { client: 'Chrome' },
]);

function testSupport(supportedDevices) {
    const deviceDetector = new DeviceDetector();
    const detectedDevice = deviceDetector.parse(navigator.userAgent);
    let isSupported = false;
    for (const device of supportedDevices) {
        if (device.client !== undefined) {
            const re = new RegExp(`^${device.client}$`);
            if (!re.test(detectedDevice.client.name)) {
                continue;
            }
        }
        if (device.os !== undefined) {
            const re = new RegExp(`^${device.os}$`);
            if (!re.test(detectedDevice.os.name)) {
                continue;
            }
        }
        isSupported = true;
        break;
    }
    if (!isSupported) {
        alert(`This demo, running on ${detectedDevice.client.name}/${detectedDevice.os.name}, ` +
            `is not well supported at this time, continue at your own risk.`);
    }
}

// Get DOM elements
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

const config = { 
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${mpHands.VERSION}/${file}`;
    } 
};

// Hide spinner when loaded
const spinner = document.querySelector('.loading');
if (spinner) {
    spinner.ontransitionend = () => {
        spinner.style.display = 'none';
    };
}

// Speech recognition setup
// Support up to 10 words (2 hands × 5 fingers each)
const recognizedWords = [];
let currentFingerIndex = 0;

// Shake detection setup
const handPositionHistory = [[], []]; // Track position history for up to 2 hands
const SHAKE_THRESHOLD = 0.08; // Movement threshold to detect shaking
const SHAKE_COUNT_THRESHOLD = 8; // Number of rapid movements needed to trigger clear
const HISTORY_LENGTH = 10; // Number of frames to keep in history
let shakeCounter = [0, 0]; // Counter for shake detection for each hand

// Initialize speech recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                const transcript = event.results[i][0].transcript.trim();
                const words = transcript.split(/\s+/);

                // Add each word to the array (cycle through 10 positions for 2 hands)
                words.forEach(word => {
                    recognizedWords[currentFingerIndex] = word;
                    currentFingerIndex = (currentFingerIndex + 1) % 10; // Cycle through 10 fingers (2 hands)
                });
                console.log('Recognized words:', recognizedWords);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            // Only log significant errors
            console.log('Error type:', event.error);
        }
    };

    recognition.onend = () => {
        // Restart recognition if it stops
        try {
            recognition.start();
        } catch (e) {
            console.error('Could not restart recognition:', e);
        }
    };

    // Start speech recognition
    try {
        recognition.start();
        console.log('Speech recognition started');
    } catch (e) {
        console.error('Could not start recognition:', e);
    }
} else {
    console.error('Speech recognition not supported in this browser');
    alert('Speech recognition is not supported in your browser. Please use Chrome.');
}

function onResults(results) {
    document.body.classList.add('loaded');

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandedness) {
        const numHands = results.multiHandLandmarks.length;

        for (let handIndex = 0; handIndex < numHands; handIndex++) {
            const classification = results.multiHandedness[handIndex];
            const isRightHand = classification.label === 'Right';
            const landmarks = results.multiHandLandmarks[handIndex];

            // Shake detection: track wrist position (landmark 0)
            const wrist = landmarks[0];
            const currentPosition = { x: wrist.x, y: wrist.y };

            // Initialize history array for this hand if needed
            if (!handPositionHistory[handIndex]) {
                handPositionHistory[handIndex] = [];
            }

            // Add current position to history
            handPositionHistory[handIndex].push(currentPosition);

            // Keep only recent history
            if (handPositionHistory[handIndex].length > HISTORY_LENGTH) {
                handPositionHistory[handIndex].shift();
            }

            // Detect shaking: check for rapid direction changes
            if (handPositionHistory[handIndex].length >= 4) {
                const history = handPositionHistory[handIndex];
                const len = history.length;

                // Calculate movement in last few frames
                const recentMovement = Math.abs(history[len - 1].x - history[len - 3].x) +
                                      Math.abs(history[len - 1].y - history[len - 3].y);

                if (recentMovement > SHAKE_THRESHOLD) {
                    shakeCounter[handIndex]++;

                    // If enough rapid movements detected, clear all text
                    if (shakeCounter[handIndex] >= SHAKE_COUNT_THRESHOLD) {
                        console.log('Shake detected! Clearing all text.');
                        recognizedWords.length = 0; // Clear all words
                        currentFingerIndex = 0; // Reset finger index
                        shakeCounter[handIndex] = 0; // Reset shake counter

                        // Show visual feedback
                        canvasCtx.font = 'bold 40px Arial';
                        canvasCtx.fillStyle = '#FFFFFF';
                        canvasCtx.strokeStyle = '#FFFFFF';
                        canvasCtx.lineWidth = 4;
                        const text = '!!';
                        const metrics = canvasCtx.measureText(text);
                        canvasCtx.strokeText(text, (canvasElement.width - metrics.width) / 2, canvasElement.height / 2);
                        canvasCtx.fillText(text, (canvasElement.width - metrics.width) / 2, canvasElement.height / 2);
                    }
                } else {
                    // Decay shake counter if no movement
                    shakeCounter[handIndex] = Math.max(0, shakeCounter[handIndex] - 0.5);
                }
            }

            // Define which landmarks to draw (fingertips only)
            // Order: Thumb, Index, Middle, Ring, Pinky
            const fingertipIndices = [4, 8, 12, 16, 20];
            const filteredLandmarks = fingertipIndices.map(i => landmarks[i]);

            // Draw only the fingertip points
            drawingUtils.drawLandmarks(canvasCtx, filteredLandmarks, {
                color: isRightHand ? '#00FF00' : '#FF0000',
                fillColor: isRightHand ? '#FF0000' : '#00FF00',
                radius: 5
            });

            // Calculate word offset based on hand index
            // First hand (index 0) uses words 0-4
            // Second hand (index 1) uses words 5-9
            const wordOffset = handIndex * 5;

            // Draw recognized words at fingertip positions
            canvasCtx.font = '20px Arial';
            canvasCtx.fillStyle = '#FFFFFF';
            canvasCtx.strokeStyle = '#000000';
            canvasCtx.lineWidth = 3;

            fingertipIndices.forEach((landmarkIndex, fingerIndex) => {
                const landmark = landmarks[landmarkIndex];
                const x = landmark.x * canvasElement.width;
                const y = landmark.y * canvasElement.height;

                // Get the word for this finger from the appropriate range
                const wordIndex = wordOffset + fingerIndex;

                // Display word if exists for this finger
                if (recognizedWords[wordIndex]) {
                    const word = recognizedWords[wordIndex];
                    const textMetrics = canvasCtx.measureText(word);
                    const textX = x - textMetrics.width / 2;
                    const textY = y - 15; // Position text above fingertip

                    // Draw text with outline for better visibility
                    canvasCtx.strokeText(word, textX, textY);
                    canvasCtx.fillText(word, textX, textY);
                }
            });
        }
    }
    canvasCtx.restore();
}

// Initialize MediaPipe Hands
const hands = new mpHands.Hands(config);
hands.setOptions({
    selfieMode: true,
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
hands.onResults(onResults);

// Set up camera
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});
camera.start();