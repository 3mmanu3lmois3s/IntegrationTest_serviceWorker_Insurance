// main.js
let newWorker;
const basePath = '/IntegrationTest_serviceWorker_Insurance/'; // ADD TRAILING SLASH

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(basePath + 'sw.js')  // basePath already includes the /
        .then(registration => {
            console.log('Service Worker registered with scope:', registration.scope);
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
            console.log('Service Worker registration failed:', error);
        });
}

let customerId;
let quoteId;
let policyId;
let claimId;

// Initialize progress indicators
function initializeProgressIndicators() {
    const indicatorsDiv = document.getElementById('progress-indicators');
    for (let i = 0; i < 13; i++) {
        const indicator = document.createElement('span');
        indicator.classList.add('progress-indicator');
        indicator.id = 'indicator-' + i;
        indicatorsDiv.appendChild(indicator);
    }
}


// --- Event Listener para los Botones (Centralizado) ---
document.addEventListener('DOMContentLoaded', () => {
    initializeProgressIndicators();
    // Load completed steps from localStorage
    loadProgress();


    document.addEventListener('click', async function(event) {
        if (event.target.matches('button[data-api-url]')) {
            const button = event.target;
            const step = parseInt(button.dataset.apiStep);
            let apiUrl = button.dataset.apiUrl;
            const method = button.dataset.method;

            // More specific data dependency checks
            let isValidRequest = true;
            let missingData = "";

            // Only check for customerId if the step REQUIRES it
            if (step !== 1 && step > 0 && typeof customerId === 'undefined') { // Exclude Step 1 (Get Products and Create Customer)
                missingData += "customerId ";
                isValidRequest = false;
            }
            // FIX: Only check for quoteId AFTER step 2.
            if ((step > 2 && step != 6 && step < 10) && typeof quoteId === 'undefined') {
                missingData += "quoteId ";
                isValidRequest = false;
            }
            if ((step > 5 && step != 8) && typeof policyId === 'undefined') {
               missingData += "policyId ";
               isValidRequest = false;
            }

            if (step == 8 && typeof claimId === 'undefined') {
                missingData += "claimId ";
                isValidRequest = false;

            }

            if (!isValidRequest) {
                document.getElementById('response').textContent = `Error: Missing data: ${missingData} to perform this request.`;
                return;
            }
            // ... rest of the fetch logic (no changes needed here) ...
             // Replace placeholders with actual values
            apiUrl = apiUrl.replace(':customerId:', customerId);
            apiUrl = apiUrl.replace(':quoteId:', quoteId);
            apiUrl = apiUrl.replace(':policyId:', policyId);
            apiUrl = apiUrl.replace(':claimId:', claimId)

            //Conditional body
            let bodyData = null;
            if (method === 'POST' || method === 'PUT') {
                switch(step){
                    case 0: // Create Customer
                        bodyData = { name: 'Test Customer', email: 'test@example.com', address: '123 Main St' };
                        break;
                    case 2: //Start a Quote
                        bodyData = {productId: "home-insurance"}
                        break;
                    case 3: //Update Quote
                        bodyData = {address: 'Fake st 123', city: 'Springfield'}
                        break;
                    case 5://Accept Quote
                        bodyData = {}
                        break;
                    case 7://Create Claim
                        bodyData = { policyId: policyId, description: "Wind damage to roof" }
                        break;
                    case 10://Renew Policy
                        bodyData = {}
                        break;
                    default:
                        bodyData = {}
                }
            }

            try {
                const response = await fetchData(basePath + apiUrl, method, bodyData); //Add basepath here
                // Removed setting response here.  Handled in fetchData.
                // document.getElementById('response').textContent = JSON.stringify(response, null, 2);
                // Skip visual mark for debug-only steps
                if (step <= 10) {
                    markStepComplete(step);
                }
                    //Update variables if I get them from response
                customerId = response.customerId || customerId;
                quoteId = response.quoteId || quoteId;
                policyId = response.policyId || policyId;
                claimId = response.claimId || claimId;

                // Mark step as complete
                markStepComplete(step);

            } catch (error) {
              // Error handling is now *inside* fetchData, so this is less likely to be hit.
              //  But, it's still good to have a top-level catch.
                console.error("Top-level error:", error); // Log for debugging
                displayResponse(`Error: ${error.message}`); // Show a user-friendly message

            }

        }
       else if (event.target.id === 'updateSW' && newWorker) {
            newWorker.postMessage({ action: 'skipWaiting' });
        }
    });
});

async function fetchData(url, method = 'GET', bodyData = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (bodyData) {
        options.body = JSON.stringify(bodyData);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        // Handle HTTP errors (4xx or 5xx)
        let errorText = `HTTP error! Status: ${response.status}`;
        try {
            // Try to get JSON error data, but ONLY if the content type is JSON
            if (response.headers.get('Content-Type')?.includes('application/json')) {
                const errorData = await response.json();
                errorText += `\nError: ${errorData.error || JSON.stringify(errorData)}`;
            } else {
                // If it's not JSON, get the text
                errorText += `\nError: ${await response.text()}`;
            }

        } catch (e) {
            // If we couldn't parse as JSON *or* text, just use the status
            errorText += `\nCould not parse error response.`;
        }
        displayResponse(errorText);
        throw new Error(errorText);
    }

    // Handle 204 No Content (successful, but no body)
    if (response.status === 204) {
        displayResponse("Success (No Content)");
        return null; // Or return {};  Depends on your needs
    }

    // If we get here, the response is OK and (presumably) has a JSON body
    try {
        const data = await response.json();
        displayResponse(JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error("JSON parsing error:", error);
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


function markStepComplete(step) {
    const indicator = document.getElementById('indicator-' + step);
    if (indicator) {
        indicator.classList.add('complete');
    } else {
        console.warn(`No indicator found for step ${step}. Skipping visual mark.`);
    }

    let completedSteps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    completedSteps.push(step);
    completedSteps = [...new Set(completedSteps)].sort((a, b) => a - b);
    localStorage.setItem('completedSteps', JSON.stringify(completedSteps));
}

function isStepValid(step) {
    const completedSteps = JSON.parse(localStorage.getItem('completedSteps') || '[]');

    if (step === 0) {
        return true; // Step 0 is always valid
    }
    //Check if all previous steps were done
    for(let i=0; i<step; i++){
        if(!completedSteps.includes(i)) return false
    }
    return true; // All previous steps are complete
}

function loadProgress() {
    const completedSteps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    completedSteps.forEach(step => {
        document.getElementById('indicator-' + step).classList.add('complete');
    });
}

// Add the displayResponse function (if you haven't already)
function displayResponse(message) {
    const responseDiv = document.getElementById('response');
    responseDiv.textContent = message;
}