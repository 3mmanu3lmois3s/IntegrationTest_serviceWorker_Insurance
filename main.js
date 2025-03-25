let newWorker;
const basePath = '/IntegrationTest_serviceWorker_Insurance/';
let customerId, quoteId, policyId, claimId;
let flowStarted = false;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(basePath + 'sw.js')
        .then(registration => {
            console.log('Service Worker registered:', registration.scope);
            if (registration.waiting) {
                newWorker = registration.waiting;
                showUpdateButton();
            }
            registration.addEventListener('updatefound', () => {
                newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateButton();
                    }
                });
            });
        })
        .catch(error => console.log('Service Worker registration failed:', error));
}

document.addEventListener('DOMContentLoaded', () => {
    initializeProgressIndicators();
    lockButtons();
    displayResponse("Press 'Start' to begin the flow.");

    document.getElementById('startFlow').addEventListener('click', () => {
        resetProgress();
        flowStarted = true;
        unlockButton(0); // enable only first button
        displayResponse("Flow started. Begin with Step 1.");
    });

    document.getElementById('endFlow').addEventListener('click', () => {
        resetProgress();
        flowStarted = false;
        displayResponse("Flow has been reset. Press 'Start' to begin.");
    });


    document.addEventListener('click', async function(event) {
        if (!flowStarted || !event.target.matches('button[data-api-url]')) return;

        const button = event.target;
        const step = parseInt(button.dataset.apiStep);
        let apiUrl = button.dataset.apiUrl;
        const method = button.dataset.method;

        let isValidRequest = true;
        let missingData = "";

        if (step !== 1 && step > 0 && typeof customerId === 'undefined') {
            missingData += "customerId ";
            isValidRequest = false;
        }
        if ((step > 2 && step != 6 && step < 10) && typeof quoteId === 'undefined') {
            missingData += "quoteId ";
            isValidRequest = false;
        }
        if ((step > 5 && step != 8) && typeof policyId === 'undefined') {
            missingData += "policyId ";
            isValidRequest = false;
        }
        if (step === 8 && typeof claimId === 'undefined') {
            missingData += "claimId ";
            isValidRequest = false;
        }

        if (!isValidRequest) {
            displayResponse(`Error: Missing data: ${missingData}`);
            return;
        }

        apiUrl = apiUrl.replace(':customerId:', customerId);
        apiUrl = apiUrl.replace(':quoteId:', quoteId);
        apiUrl = apiUrl.replace(':policyId:', policyId);
        apiUrl = apiUrl.replace(':claimId:', claimId);

        let bodyData = null;
        if (method === 'POST' || method === 'PUT') {
            switch (step) {
                case 0: bodyData = { name: 'Test Customer', email: 'test@example.com', address: '123 Main St' }; break;
                case 2: bodyData = { productId: "home-insurance" }; break;
                case 3: bodyData = { address: 'Fake st 123', city: 'Springfield' }; break;
                case 5: bodyData = {}; break;
                case 7: bodyData = { policyId: policyId, description: "Wind damage to roof" }; break;
                case 10: bodyData = {}; break;
                default: bodyData = {};
            }
        }

        try {
            const response = await fetchData(basePath + apiUrl, method, bodyData);

            const visuallyTrackableSteps = [...Array(13).keys()];

            // Success is assumed if fetchData did not throw
            if (visuallyTrackableSteps.includes(step)) {
                markStepComplete(step);
                unlockButton(step + 1);
            }

            customerId = response.customerId || customerId;
            quoteId = response.quoteId || quoteId;
            policyId = response.policyId || policyId;
            claimId = response.claimId || claimId;

        } catch (error) {
            console.error("Top-level error:", error);
            displayResponse(`Error: ${error.message}`);
        }
    });
});

async function fetchData(url, method = 'GET', bodyData = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (bodyData) options.body = JSON.stringify(bodyData);

    const response = await fetch(url, options);

    if (!response.ok) {
        if (response.status === 400 && response.headers.get('Content-Type')?.includes('application/json')) {
            const errorData = await response.json();
            if (errorData?.error === "Policy is not renewable yet") {
                displayResponse(errorData.error);
                return errorData;
            }
        }

        let errorText = `HTTP error! Status: ${response.status}`;
        try {
            if (response.headers.get('Content-Type')?.includes('application/json')) {
                const errorData = await response.json();
                errorText += `\nError: ${errorData.error || JSON.stringify(errorData)}`;
            } else {
                errorText += `\nError: ${await response.text()}`;
            }
        } catch {
            errorText += `\nCould not parse error response.`;
        }
        displayResponse(errorText);
        throw new Error(errorText);
    }

    if (response.status === 204) {
        displayResponse("Success (No Content)");
        return null;
    }

    try {
        const data = await response.json();
        displayResponse(JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        displayResponse("Error: Invalid JSON response from server.");
        throw error;
    }
}

function showUpdateButton() {
    document.getElementById('updateSW').style.display = 'block';
}

function updateOnlineStatus() {
    document.getElementById('status').textContent = navigator.onLine ? 'Online' : 'Offline';
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

function initializeProgressIndicators() {
    const indicatorsDiv = document.getElementById('progress-indicators');
    for (let i = 0; i < 13; i++) {
        const indicator = document.createElement('span');
        indicator.classList.add('progress-indicator');
        indicator.id = 'indicator-' + i;
        indicatorsDiv.appendChild(indicator);
    }
}

function markStepComplete(step) {
    const indicator = document.getElementById('indicator-' + step);
    if (indicator) indicator.classList.add('complete');

    const btn = document.querySelector(`button[data-api-step="${step}"]`);
    if (btn) btn.classList.add('complete-step');

    let completedSteps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    completedSteps.push(step);
    completedSteps = [...new Set(completedSteps)].sort((a, b) => a - b);
    localStorage.setItem('completedSteps', JSON.stringify(completedSteps));
}

function resetProgress() {
    localStorage.removeItem('completedSteps');
    customerId = quoteId = policyId = claimId = undefined;

    for (let i = 0; i < 13; i++) {
        const el = document.getElementById('indicator-' + i);
        if (el) el.classList.remove('complete');
        const btn = document.querySelector(`button[data-api-step="${i}"]`);
        if (btn) {
            btn.classList.remove('complete-step');
            btn.disabled = true;
        }
    }
}

function lockButtons() {
    const buttons = document.querySelectorAll('button[data-api-step]');
    buttons.forEach(btn => btn.disabled = true);
}

function unlockButton(step) {
    const btn = document.querySelector(`button[data-api-step="${step}"]`);
    if (btn) btn.disabled = false;
}

function displayResponse(message) {
    const responseDiv = document.getElementById('response');
    responseDiv.textContent = message;
}
