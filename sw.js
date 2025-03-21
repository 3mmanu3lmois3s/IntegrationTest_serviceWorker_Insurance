// sw.js
/*jshint esversion: 6 */
/*jshint worker: true */
const basePath = '/IntegrationTest_serviceWorker_Insurance/'; // Corrected base path

self.addEventListener('install', function(event) {
    console.log('Service Worker installing.');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', async function(event) { // Add async
    console.log('Service Worker activating.');
    event.waitUntil(
        (async () => { // Wrap in an async IIFE
            await openDB(); // AWAIT openDB()
            await clients.claim(); // Now safe to claim clients
            testHttpMethods(); // And run tests (though fetch listener isn't set up yet, so these will likely still fail).
        })()
    );
});

async function testHttpMethods() {
    const testUrls = [
        { url: `${basePath}test/get`, method: 'GET' },
        { url: `${basePath}test/post`, method: 'POST', body: JSON.stringify({ test: 'data' }) },
        { url: `${basePath}test/put`, method: 'PUT', body: JSON.stringify({ test: 'data' }) },
        { url: `${basePath}test/delete`, method: 'DELETE' },
    ];

    for (const { url, method, body } of testUrls) {
        try {
            const request = new Request(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: body
            });

            const response = await self.fetch(request); // Fetch *from itself*!
            console.log(`Service Worker self-test: ${method} ${url} - Status: ${response.status}`);
            if (!response.ok) {
                console.error(`  Error: ${await response.text()}`);
            }
        } catch (error) {
            console.error(`Service Worker self-test: ${method} ${url} - FAILED`, error);
        }
    }
}
//corregido EM
self.addEventListener('fetch', function(event) {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.pathname.startsWith(basePath)) {
        const relativePath = requestUrl.pathname.substring(basePath.length);
        const method = event.request.method;

        // Check if the request is for an API endpoint
        if (relativePath.startsWith('api/')) {
            const apiPath = relativePath.substring(4); // Remove 'api/'

            switch (apiPath) {
                case 'data':
                    if (method === 'GET') {
                        event.respondWith(
                            new Response(JSON.stringify({ message: 'Hello from Service Worker! (data)' }), {
                                headers: { 'Content-Type': 'application/json' }
                            })
                        );
                    } else if (method === 'POST') { // Add this!
                        event.respondWith(
                            new Response(JSON.stringify({ message: 'POST request to /api/data handled' }), {
                                headers: { 'Content-Type': 'application/json' }
                            })
                        );
                    }
                    break; // VERY IMPORTANT
                case 'users':
                    if (method === 'GET') {
                        event.respondWith(
                            new Response(JSON.stringify([{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Doe' }]), {
                                headers: { 'Content-Type': 'application/json' }
                            })
                        );
                    }
                    break;
                case 'customers':
                     if (method === 'POST') {
                        console.log("Service Worker: Handling POST /api/customers");
                        event.respondWith(handleCreateCustomer(event.request));
                    } else if (method === 'GET'){
                        event.respondWith(handleGetAllCustomers());
                    }
                    break;
                case (apiPath.match(/^customers\/\w+$/)?.input): // Matches "customers/<customerId>"
                       if(method === 'GET'){
                            const customerId = apiPath.split('/')[1];
                            console.log("Service Worker: Handling GET /api/customers/" + customerId);
                            event.respondWith(handleGetCustomer(customerId));
                       }
                       break;
                case 'messages':
                    if (method === 'POST') {
                        event.respondWith(handlePostMessage(event.request));
                    } else if (method === 'GET') {
                        event.respondWith(handleGetAllMessages());
                    }
                    break;

                default:
                    if(apiPath.startsWith('user/') && method === 'GET'){ // For /api/user/<userId>
                        const userId = apiPath.substring('user/'.length);
                         event.respondWith(
                            new Response(JSON.stringify({ id: userId, name: 'User ' + userId }), {
                                headers: { 'Content-Type': 'application/json' }
                            })
                        );
                    } else if (apiPath.startsWith('search') && method === 'GET') {
                        const urlParams = new URLSearchParams(requestUrl.search);
                        const terms = urlParams.get('terms');
                        event.respondWith(handleSearchMessages(terms));

                    // Handle other customer-related routes (quotes, policies, claims)
                    } else if (apiPath.startsWith('customers/')) {
                        const parts = apiPath.split('/');
                        const customerId = parts[1];

                        if (parts[2] === 'quotes' && method === 'POST') {
                            event.respondWith(handleStartQuote(customerId, event.request));
                        } else if (parts[2] === 'quotes' && parts.length === 4 && method === 'PUT') {
                            const quoteId = parts[3];
                             event.respondWith(handleUpdateQuote(customerId, quoteId, event.request));
                        } else if (parts[2] === 'quotes' && parts[4] === 'calculate' && method === 'POST') {
                            const quoteId = parts[3];
                            event.respondWith(handleCalculatePremium(customerId, quoteId));
                        } else if (parts[2] === 'quotes' && parts[4] === 'accept' && method === 'POST') {
                            const quoteId = parts[3];
                            event.respondWith(handleAcceptQuote(customerId, quoteId, event.request));
                        } else if (parts[2] === 'policies' && parts.length === 4 && method === 'GET') {
                            const policyId = parts[3];
                            event.respondWith(handleGetPolicy(customerId, policyId));
                        } else if (parts[2] === 'claims' && method === 'POST') {
                            event.respondWith(handleFileClaim(customerId, event.request));
                        } else if (parts[2] === 'claims' && parts.length === 4 && method === 'GET') {
                            const claimId = parts[3];
                            event.respondWith(handleGetClaim(customerId, claimId));
                        } else if (parts[2] === 'policies' && parts[4] === 'renewal' && method === 'GET') {
                            const policyId = parts[3];
                            event.respondWith(handleGetRenewalInfo(customerId, policyId));
                        } else if (parts[2] === 'policies' && parts[4] === 'renew' && method === 'POST') {
                            const policyId = parts[3];
                            event.respondWith(handleRenewPolicy(customerId, policyId, event.request));
                        }
                        else {
                            console.log('Service Worker: Passing request to network (Unhandled customer route):', event.request.url);
                            event.respondWith(fetch(event.request));
                        }
                    }
                     else {
                        console.log('Service Worker: Passing request to network (API endpoint not found):', event.request.url);
                        event.respondWith(fetch(event.request));
                    }
                    break; // Important: Add break after each case
            }
        } else {
            console.log('Service Worker: Passing request to network (Non-API request):', event.request.url);
            event.respondWith(fetch(event.request));
        }
    } else {
        console.log('Service Worker: Passing request to network (not in base path):', event.request.url);
        event.respondWith(fetch(event.request));
    }
});

// NEW (INDEXEDDB) VERSION - USE THIS

async function handleCreateCustomer(request) {
    try {
        const body = await request.json();
        console.log('Service Worker: Received customer data:', body);

        const customerId = await addCustomerToDB(body); // Use the IndexedDB helper

        return new Response(JSON.stringify({ customerId: customerId }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Service Worker: Error in handleCreateCustomer:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
async function addCustomerToDB(customerData) {
    if (!db) {
        await openDB();
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([customerStoreName], 'readwrite');
        const store = transaction.objectStore(customerStoreName);
        const customerId = `cust-${Date.now()}`;
        const customer = { ...customerData, id: customerId };
        const request = store.add(customer);

        request.onsuccess = () => {
            console.log('Customer added to IndexedDB:', customer);
            resolve(customerId);
        };
          

        request.onerror = (event) => {
            console.error('Error adding customer to IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });

}

async function handleGetAllCustomers() {
    try {
        const customers = await getAllCustomersFromDB(); // Use the IndexedDB helper
        return new Response(JSON.stringify(customers), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Service Worker: Error in handleGetAllCustomers:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleGetProducts(){
    return new Response(JSON.stringify(db.products), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleStartQuote(customerId, request){
     const body = await request.json();
    if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    const quoteId = `quote${nextQuoteId++}`;
    db.quotes[quoteId] = {
        quoteId,
        customerId,
        productId: body.productId, //From the request
        status: 'draft',
        details: {} // Initial details are empty
    };
    return new Response(JSON.stringify({ quoteId }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleUpdateQuote(customerId, quoteId, request){
    if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    if (!db.quotes[quoteId]) {
        throw new Error("Quote not found");
    }
    const body = await request.json();
    db.quotes[quoteId].details = { ...db.quotes[quoteId].details, ...body }; //Update the details
    return new Response(JSON.stringify({success: true}), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleCalculatePremium(customerId, quoteId){
     if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    if (!db.quotes[quoteId]) {
        throw new Error("Quote not found");
    }
    //Very simple mock calculation
    const premium = Math.floor(Math.random() * 1000) + 500; //Random between 500 - 1500
    db.quotes[quoteId].premium = premium;
    db.quotes[quoteId].status = 'calculated';

    return new Response(JSON.stringify({ premium: premium }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleAcceptQuote(customerId, quoteId, request){
    if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    if (!db.quotes[quoteId]) {
        throw new Error("Quote not found");
    }
    if(db.quotes[quoteId].status !== 'calculated'){
        throw new Error("Quote is not in 'calculated' status. Cannot accept.");
    }
    const policyId = `policy${nextPolicyId++}`;
    db.policies[policyId] = {
        policyId,
        customerId,
        quoteId,
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString() // One year later
    };

     //Clean quote
    delete db.quotes[quoteId];

    return new Response(JSON.stringify({ policyId }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetPolicy(customerId, policyId){
    if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
   if (!db.policies[policyId]) {
        throw new Error("Policy not found");
    }
    return new Response(JSON.stringify(db.policies[policyId]), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleFileClaim(customerId, request){
    if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    const body = await request.json();
    if(!db.policies[body.policyId]){
         throw new Error("Policy not found");
    }

    const claimId = `claim${nextClaimId++}`; // Simple ID generation
    db.claims[claimId] = {
        claimId,
        customerId,
        policyId: body.policyId,
        status: 'open',
        description: body.description,
        date: new Date().toISOString()
    };
    return new Response(JSON.stringify({ claimId }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetClaim(customerId, claimId){
 if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    if (!db.claims[claimId]) {
        throw new Error("Claim not found");
    }

    return new Response(JSON.stringify(db.claims[claimId]), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetRenewalInfo(customerId, policyId){
 if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    if (!db.policies[policyId]) {
        throw new Error("Policy not found");
    }

    const policy = db.policies[policyId];
     // Check if the policy is near its end date (e.g., within 30 days)
    const endDate = new Date(policy.endDate);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let renewalInfo = {};
    if(diffDays <= 30){
         const newPremium = Math.floor(Math.random() * 1000) + 500; // Random
        renewalInfo = {
            policyId: policyId,
            newStartDate: endDate.toISOString(),
            newEndDate: new Date(new Date(endDate).setFullYear(endDate.getFullYear() + 1)).toISOString(),
            newPremium: newPremium,
            status: 'available'
        }
    } else {
        renewalInfo = {status: 'not_available'}
    }
      return new Response(JSON.stringify(renewalInfo), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleRenewPolicy(customerId, policyId, request){
 if (!db.customers[customerId]) {
        throw new Error("Customer not found");
    }
    if (!db.policies[policyId]) {
        throw new Error("Policy not found");
    }
     const policy = db.policies[policyId];
     // Check if the policy is near its end date (e.g., within 30 days)
    const endDate = new Date(policy.endDate);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if(diffDays > 30){
        throw new Error("Policy is not renewable yet");
    }
     //Update policy
    policy.startDate = endDate.toISOString();
    policy.endDate = new Date(new Date(endDate).setFullYear(endDate.getFullYear() + 1)).toISOString(); // One year later

    return new Response(JSON.stringify({success: true}), {
        headers: { 'Content-Type': 'application/json' }
    });
}