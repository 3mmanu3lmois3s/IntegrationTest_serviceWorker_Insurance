// main.js
let newWorker;
const basePath = '/IntegrationTest_serviceWorker_Insurance';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(basePath + '/sw.js')
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


// --- Event Listener para los Botones (Centralizado) ---
document.addEventListener('DOMContentLoaded', () => {
    initializeProgressIndicators();
    // Load completed steps from localStorage
    loadProgress();


    document.addEventListener('click', async function(event) {
        if (event.target.matches('button[data-api-url]')) {
            const button = event.target;
            const step = parseInt(button.dataset.apiStep);
            //Sequential validation
            if (!isStepValid(step)) {
                    let missingData = "";
                    if(typeof customerId === 'undefined' && step>0) missingData += "customerId ";
                    if(typeof quoteId === 'undefined' && (step > 1 && step !=6 && step < 10)) missingData += "quoteId ";
                    if(typeof policyId === 'undefined' && (step > 5 && step !=8)) missingData += "policyId ";
                    if(typeof claimId === 'undefined' && step == 8) missingData += "claimId ";

                    document.getElementById('response').textContent = `Error: Missing data: ${missingData} to perform this request.`;
                    return;
            }

            let apiUrl = button.dataset.apiUrl;
            const method = button.dataset.method;

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
                document.getElementById('response').textContent = JSON.stringify(response, null, 2);

                 //Update variables if I get them from response
                customerId = response.customerId || customerId;
                quoteId = response.quoteId || quoteId;
                policyId = response.policyId || policyId;
                claimId = response.claimId || claimId;

                // Mark step as complete
                markStepComplete(step);

            } catch (error) {
                document.getElementById('response').textContent = 'Error: ' + error.message;
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
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
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