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
        .catch(error => {
            console.log('SW registration failed:', error);
        });
}

document.addEventListener('DOMContentLoaded', () => {
    lockButtons();
    initializeProgressIndicators();

    document.getElementById('startFlow').addEventListener('click', () => {
        flowStarted = true;
        resetProgress(); // limpia visualmente también
        unlockButton(0); // primer paso
    });

    document.getElementById('endFlow').addEventListener('click', () => {
        flowStarted = false;
        resetProgress();
        displayResponse("Flow has been reset. Press 'Start' to begin.");
    });

    document.addEventListener('click', async (event) => {
        if (!flowStarted) return;

        if (event.target.matches('button[data-api-url]')) {
            const button = event.target;
            const step = parseInt(button.dataset.apiStep);
            let apiUrl = button.dataset.apiUrl;
            const method = button.dataset.method;

            // Dependency validation
            let isValidRequest = true;
            let missing = "";

            if (step !== 1 && step > 0 && !customerId) {
                isValidRequest = false; missing += "customerId ";
            }
            if ((step > 2 && step !== 6 && step < 10) && !quoteId) {
                isValidRequest = false; missing += "quoteId ";
            }
            if ((step > 5 && step !== 8) && !policyId) {
                isValidRequest = false; missing += "policyId ";
            }
            if (step === 8 && !claimId) {
                isValidRequest = false; missing += "claimId ";
            }
            if (!isValidRequest) {
                displayResponse(`Error: Missing data: ${missing}`);
                return;
            }

            // Replace placeholders
            apiUrl = apiUrl.replace(':customerId:', customerId);
            apiUrl = apiUrl.replace(':quoteId:', quoteId);
            apiUrl = apiUrl.replace(':policyId:', policyId);
            apiUrl = apiUrl.replace(':claimId:', claimId);

            let bodyData = null;
            if (['POST', 'PUT'].includes(method)) {
                switch (step) {
                    case 0: bodyData = { name: 'Test Customer', email: 'test@example.com', address: '123 Main St' }; break;
                    case 2: bodyData = { productId: "home-insurance" }; break;
                    case 3: bodyData = { address: 'Fake st 123', city: 'Springfield' }; break;
                    case 5: case 10: bodyData = {}; break;
                    case 7: bodyData = { policyId, description: "Wind damage to roof" }; break;
                    default: bodyData = {};
                }
            }

            try {
                const response = await fetchData(basePath + apiUrl, method, bodyData);

                const businessOK = response?.success === true || response?.error === "Policy is not renewable yet";
                if (businessOK) {
                    markStepComplete(step);
                    button.classList.add("complete-step");
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
        } else if (event.target.id === 'updateSW' && newWorker) {
            newWorker.postMessage({ action: 'skipWaiting' });
        }
    });

    loadProgress();
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
});

function resetProgress() {
    localStorage.removeItem('completedSteps');
    customerId = quoteId = policyId = claimId = undefined;

    for (let i = 0; i < 13; i++) {
        document.getElementById('indicator-' + i)?.classList.remove('complete');
        document.querySelector(`button[data-api-step="${i}"]`)?.classList.remove('complete-step');
    }

    lockButtons();
}

function initializeProgressIndicators() {
    const container = document.getElementById('progress-indicators');
    for (let i = 0; i < 13; i++) {
        const span = document.createElement('span');
        span.classList.add('progress-indicator');
        span.id = 'indicator-' + i;
        container.appendChild(span);
    }
}

function loadProgress() {
    const steps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    steps.forEach(step => {
        document.getElementById('indicator-' + step)?.classList.add('complete');
        document.querySelector(`button[data-api-step="${step}"]`)?.classList.add('complete-step');
    });
}

function lockButtons() {
    document.querySelectorAll('button[data-api-step]').forEach(btn => btn.disabled = true);
}

function unlockButton(step) {
    document.querySelector(`button[data-api-step="${step}"]`)?.removeAttribute('disabled');
}

function markStepComplete(step) {
    document.getElementById('indicator-' + step)?.classList.add('complete');
    document.querySelector(`button[data-api-step="${step}"]`)?.classList.add('complete-step');

    let steps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    steps.push(step);
    steps = [...new Set(steps)].sort((a, b) => a - b);
    localStorage.setItem('completedSteps', JSON.stringify(steps));
}

function showUpdateButton() {
    document.getElementById('updateSW').style.display = 'block';
}

function updateOnlineStatus() {
    document.getElementById('status').textContent = navigator.onLine ? 'Online' : 'Offline';
}

function displayResponse(message) {
    document.getElementById('response').textContent = message;
}

async function fetchData(url, method = 'GET', bodyData = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (bodyData) {
        options.body = JSON.stringify(bodyData);
    }

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
            const contentType = response.headers.get('Content-Type');
            if (contentType?.includes('application/json')) {
                const errorData = await response.json();
                errorText += `\nError: ${errorData.error || JSON.stringify(errorData)}`;
            } else {
                errorText += `\nError: ${await response.text()}`;
            }
        } catch (e) {
            errorText += "\nCould not parse error response.";
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
