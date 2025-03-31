// main.js
let newWorker;
const basePath = '/IntegrationTest_serviceWorker_Insurance/';
let customerId, quoteId, policyId, claimId;
let flowStarted = false;
let tooltipInstances = []; // Para guardar las instancias de los tooltips

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
    lockButtons(); // Bloquea botones al inicio
    displayResponse("Press 'Start' to begin the flow.");

    // --- Inicializar Tooltips de Bootstrap ---
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipInstances = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl, {
        trigger: 'manual' // Los mostraremos manualmente al hacer clic
    }));

    document.getElementById('startFlow').addEventListener('click', () => {
        resetProgress();
        flowStarted = true;
        unlockButton(0); // Habilita solo el primer botón
        displayResponse("Flow started. Begin with Step 1.");
        hideAllTooltips(); // Oculta tooltips al iniciar
    });

    document.getElementById('endFlow').addEventListener('click', () => {
        resetProgress();
        flowStarted = false;
        displayResponse("Flow has been reset. Press 'Start' to begin.");
        hideAllTooltips(); // Oculta tooltips al resetear
    });

    document.addEventListener('click', async function(event) {
        const targetButton = event.target.closest('button'); // Encuentra el botón clickeado

        if (targetButton?.matches('button[data-api-url]') && flowStarted) {
            hideAllTooltips(); // Oculta otros tooltips

            const step = parseInt(targetButton.dataset.apiStep);
            let apiUrl = targetButton.dataset.apiUrl;
            const method = targetButton.dataset.method;

            // --- Mostrar Tooltip ---
            const tooltipInstance = bootstrap.Tooltip.getInstance(targetButton);
            if (tooltipInstance) {
                tooltipInstance.show();
                // Opcional: ocultar automáticamente después de un tiempo
                 setTimeout(() => tooltipInstance.hide(), 5000); // Oculta después de 5 segundos
            }

            let isValidRequest = true;
            let missingData = "";

            if (step !== 1 && step > 0 && typeof customerId === 'undefined') {
                missingData += "customerId ";
                isValidRequest = false;
            }
            if ((step > 2 && step != 6 && step < 10 && step != 11 && step != 12) && typeof quoteId === 'undefined') {
                missingData += "quoteId ";
                isValidRequest = false;
            }
             if ((step > 5 && step != 8 && step < 10) && typeof policyId === 'undefined') {
                missingData += "policyId ";
                isValidRequest = false;
            }
            if ((step > 7 && step < 9) && typeof policyId === 'undefined') { // Ajustado para Claim y GetClaim
                 missingData += "policyId ";
                 isValidRequest = false;
            }
            if ((step === 8 || step === 9) && typeof claimId === 'undefined' && step !==7) { //Ajustado para Get Claim
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

                 // Verifica si la respuesta contiene los IDs esperados
                if (response) {
                    customerId = response.customerId || customerId;
                    quoteId = response.quoteId || quoteId;
                    policyId = response.policyId || policyId;
                    claimId = response.claimId || claimId;

                    // Comprueba si el paso es visualmente rastreable y lo marca
                     const visuallyTrackableSteps = [...Array(13).keys()]; // Considera hasta el paso 12
                    if (visuallyTrackableSteps.includes(step)) {
                        markStepComplete(step);
                        // Solo desbloquea el siguiente botón si el paso actual es menor que el último paso rastreable (10)
                        // y el paso actual no es un paso de depuración (11, 12)
                        if (step < 10) {
                             unlockButton(step + 1);
                        }
                         // Desbloquea los botones de debug después del paso 10
                        if (step === 10) {
                             unlockButton(11); // Ver Policies
                             unlockButton(12); // Ver Claims
                        }
                    }
                }


            } catch (error) {
                console.error("Error during step execution:", error);
                // La función fetchData ya muestra el error, pero podrías añadir algo más aquí si es necesario
            }
        } else if (targetButton?.id === 'updateSW' && newWorker) {
             hideAllTooltips();
            newWorker.postMessage({ action: 'skipWaiting' });
        } else {
             // Si se hace clic fuera de un botón de API, oculta todos los tooltips
             if (!event.target.closest('[data-bs-toggle="tooltip"]')) {
                 hideAllTooltips();
             }
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
                return errorData; // Devuelve el objeto de error específico
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
    indicatorsDiv.innerHTML = ''; // Limpia indicadores existentes
    for (let i = 0; i < 13; i++) { // Ajustado a 13 para incluir botones de debug
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
            btn.disabled = true; // Bloquea todos los botones de pasos
        }
    }
    // Asegúrate de que los botones Ver Policies/Claims también se bloqueen si es necesario
    document.querySelector('button[data-api-url="api/debug/policies"]').disabled = true;
    document.querySelector('button[data-api-url="api/debug/claims"]').disabled = true;
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

function hideAllTooltips() {
    tooltipInstances.forEach(tooltip => tooltip.hide());
}

function loadProgress() {
    const completedSteps = JSON.parse(localStorage.getItem('completedSteps') || '[]');
    if (completedSteps.length > 0) {
         flowStarted = true; // Si hay pasos guardados, el flujo está iniciado
        completedSteps.forEach(step => {
            markStepComplete(step); // Marca los pasos e indicadores
            unlockButton(step + 1); // Desbloquea el siguiente paso
             // Desbloquea los botones de debug si se completó el paso 10
             if (step === 10) {
                 unlockButton(11);
                 unlockButton(12);
             }
        });
        // Asegúrate de que el último paso completado + 1 esté habilitado
        // (a menos que todos estén completos)
        const lastCompleted = completedSteps[completedSteps.length - 1];
        if (lastCompleted < 10) {
             unlockButton(lastCompleted + 1);
        } else {
            unlockButton(11); // Desbloquea debug si el último fue 10
            unlockButton(12);
        }
    } else {
         lockButtons(); // Si no hay pasos guardados, bloquea todo
         flowStarted = false;
    }
}