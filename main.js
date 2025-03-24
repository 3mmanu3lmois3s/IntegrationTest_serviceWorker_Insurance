// main.js
let newWorker;
const basePath = '/IntegrationTest_serviceWorker_Insurance/'; // ADD TRAILING SLASH

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(basePath + 'sw.js')
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
    for (let i = 0; i < 11; i++) {
        const indicator = document.createElement('span');
        indicator.classList.add('progress-indicator');
        indicator.id = 'indicator-' + i;
        indicatorsDiv.appendChild(indicator);
    }
}

// --- Event Listener for the Buttons (Centralized) ---
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

            // Only check for customerId if the step REQUIRES it.
            // Step 0 (Create Customer) and 1 (Get Products) don't need customerId.
            if (step > 1 && typeof customerId === 'undefined') {
                missingData += "customerId ";
                isValidRequest = false;
            }

            // Don't check for quoteId, policyId, or claimId *before* the request that creates them.
            // We'll handle missing IDs *after* a failed request, if necessary.

            if (!isValidRequest) {
                displayResponse(`Error: Missing data: ${missingData} to perform this request.`);
                return;
            }

            // Replace placeholders with actual values, handling undefined values.
            apiUrl = apiUrl.replace(':customerId:', customerId || '');
            apiUrl = apiUrl.replace(':quoteId:', quoteId || '');
            apiUrl = apiUrl.replace(':policyId:', policyId || '');
            apiUrl = apiUrl.replace(':claimId:', claimId || '');

            //Conditional body
            let bodyData = null;
            if (method === 'POST' || method === 'PUT') {
                switch(step){
                    case 0: // Create Customer
                        bodyData = { name: 'Test Customer', email: 'test@example.com', address: '123 Main St' };
                        break;
                    case 2: //Start a Quote
                        bodyData = {productId: "prod-1"} // Use a valid product ID from Get Products
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
                const fullUrl = basePath + apiUrl;  // Construct the full URL
                const response = await fetchData(fullUrl, method, bodyData);

                // Update variables *only if* the response contains them.
                if (response) {
                    customerId = response.customerId || customerId;
                    quoteId = response.quoteId || quoteId;
                    policyId = response.policyId || policyId;
                    claimId = response.claimId || claimId;
                }

                // Mark step as complete
                markStepComplete(step);

            } catch (error) {
               // Error is handled in fetchData
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
            // Try to get more detailed error information from the response body
            const errorData = await response.json();
            errorText += `\nError: ${errorData.error || JSON.stringify(errorData)}`;
        } catch (e) {
            // If we couldn't parse the error as JSON, use the raw text
            errorText += `\nError: ${await response.text()}`;
        }
        displayResponse(errorText);
        throw new Error(errorText); // Re-throw to be caught by the outer try...catch (if needed)
    }

    // Try to parse JSON, but handle cases where there's no response body.
    try {
        const data = await response.json();
        displayResponse(JSON.stringify(data, null, 2)); // Pretty-print
        return data;
    } catch (error) {
        // If it's not JSON, it might be a successful response with no body (e.g., a 204 No Content).
        //  In that case, don't treat it as an error.  Just return null (or an empty object)
        if (response.status === 204) {
            displayResponse("Success (No Content)"); // Indicate success
            return null; // Or return {};  Depends on what you expect.
        } else {
            // If it's some other status and not JSON, it's an error.
            console.error("JSON parsing error:", error);
            displayResponse("Error: Invalid JSON response from server.");
            throw error; // Re-throw for consistency
        }
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
    document.getElementById('indicator-' + step).classList.add('complete');
    // Store completed step in localStorage
    let completedSteps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    completedSteps.push(step);
    completedSteps = [...new Set(completedSteps)].sort((a,b)=>a-b); //Avoid duplicates and sort
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
function displayResponse(message) {
    const responseDiv = document.getElementById('response');
    responseDiv.textContent = message;
}