// sw.js
/*jshint esversion: 6 */
/*jshint worker: true */
const basePath = '/IntegrationTest_serviceWorker_Insurance/'; // Corrected base path
const dbName = 'insuranceDB';
const customerStoreName = 'customers';
const messageStoreName = 'messages';
let db;

// --- IndexedDB Setup ---

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 2); // Increment version number!

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('IndexedDB opened successfully');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            // Create the customers object store if it doesn't exist
            if (!db.objectStoreNames.contains(customerStoreName)) {
                db.createObjectStore(customerStoreName, { keyPath: 'id' });
            }

            // Create the messages object store if it doesn't exist
            if (!db.objectStoreNames.contains(messageStoreName)) {
                db.createObjectStore(messageStoreName, { autoIncrement: true, keyPath: 'id' }); // Auto-incrementing key
            }

            console.log('IndexedDB upgraded and object stores created/checked');
        };
    });
}


// --- Helper Functions using IndexedDB ---

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

async function getCustomerFromDB(customerId) {
  if (!db) {
        await openDB();
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([customerStoreName], 'readonly');
        const store = transaction.objectStore(customerStoreName);
        const request = store.get(customerId);

        request.onsuccess = () => {
            if (request.result) {
                console.log('Customer found in IndexedDB:', request.result);
                resolve(request.result);
            } else {
                console.log('Customer not found in IndexedDB:', customerId);
                resolve(null);
            }
        };

        request.onerror = (event) => {
            console.error('Error getting customer from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

async function getAllCustomersFromDB() {
    if (!db) {
        await openDB();
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([customerStoreName], 'readonly');
        const store = transaction.objectStore(customerStoreName);
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('All customers retrieved from IndexedDB:', request.result);
            resolve(request.result);
        };

        request.onerror = (event) => {
            console.error('Error getting all customers from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Add a new message to IndexedDB
async function addMessageToDB(messageData) {
    if (!db) {
      await openDB();
    }
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([messageStoreName], 'readwrite');
      const store = transaction.objectStore(messageStoreName);
      const request = store.add(messageData); // IndexedDB will auto-generate a key

      request.onsuccess = () => {
        console.log('Message added to IndexedDB:', request.result); // result will be the key
        resolve(request.result);  // Resolve with the new message ID
      };

      request.onerror = (event) => {
        console.error('Error adding message to IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

// Search IndexedDB for messages and customer data matching the given terms
async function searchData(terms) {
    if (!db) {
        await openDB();
    }
    const searchTerms = terms.toLowerCase().split(/\s+/).filter(term => term !== '');
    if (searchTerms.length === 0) {
        return [];
    }

    const results = [];

    function objectMatchesTerms(obj, terms) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                if (typeof value === 'string' && terms.some(term => value.toLowerCase().includes(term))) {
                    return true;
                } else if (typeof value === 'object' && value !== null) {
                    if (objectMatchesTerms(value, terms)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }


    // Search the 'customers' store (no changes here)
    const customerTransaction = db.transaction([customerStoreName], 'readonly');
    const customerStore = customerTransaction.objectStore(customerStoreName);
    const customerRequest = customerStore.getAll();
    await new Promise((resolve, reject) => {
        customerRequest.onsuccess = () => {
            const customers = customerRequest.result;
            const matchedCustomers = customers.filter(customer => objectMatchesTerms(customer, searchTerms));
            results.push(...matchedCustomers.map(customer => ({ ...customer, type: 'customer' })));
            resolve();
        };
        customerRequest.onerror = () => reject(customerRequest.error);
    });

    // Search the 'messages' store (MODIFIED LOGIC)
    const messageTransaction = db.transaction([messageStoreName], 'readonly');
    const messageStore = messageTransaction.objectStore(messageStoreName);
    const messageRequest = messageStore.getAll();
    await new Promise((resolve, reject) => {
        messageRequest.onsuccess = () => {
            const messages = messageRequest.result;
            const matchedMessages = [];

            messages.forEach(message => {
                if (Array.isArray(message)) {
                    // If it's an array, iterate through each element
                    message.forEach(item => {
                        if (objectMatchesTerms(item, searchTerms)) {
                            matchedMessages.push({...item, type: "message"}); // Add individual item
                        }
                    });
                } else if (typeof message === 'object' && message !== null) {
                    // If it's a single object
                    if (objectMatchesTerms(message, searchTerms)) {
                        matchedMessages.push({...message, type: "message"});
                    }
                }
                // Ignore other types (shouldn't happen, but good to be defensive)
            });

            results.push(...matchedMessages);
            resolve();
        };
        messageRequest.onerror = () => reject(messageRequest.error);
    });

    return results;
}

// Calculate the total size of messages in IndexedDB
async function calculateTotalSize() {
    if (!db) {
        await openDB();
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([messageStoreName], 'readonly');
        const store = transaction.objectStore(messageStoreName);
        const request = store.openCursor(); // Use a cursor to iterate
        let totalSize = 0;

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                // Estimate size of the stored object (rough estimate)
                totalSize += JSON.stringify(cursor.value).length;
                cursor.continue(); // Move to the next object
            } else {
                // No more objects, resolve with the total size
                resolve(totalSize);
            }
        };

        request.onerror = (event) => {
            console.error('Error calculating total size:', event.target.error);
            reject(event.target.error);
        };
    });
}
// New helper function to retrieve all messages
async function getAllMessagesFromDB() {
    if (!db) {
        await openDB();
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([messageStoreName], 'readonly');
        const store = transaction.objectStore(messageStoreName);
        const request = store.getAll();

        request.onsuccess = () => {
            console.log('All messages retrieved from IndexedDB:', request.result);
            resolve(request.result);
        };

        request.onerror = (event) => {
            console.error('Error getting all messages from IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}



// --- Event Listeners ---

// --- Event Listeners ---

self.addEventListener('install', function(event) {
    console.log('Service Worker installing.');
    event.waitUntil(self.skipWaiting());
});

// --- Fetch Event Listener (BEFORE activate) ---
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    if (requestUrl.pathname.startsWith(basePath)) {
        const relativePath = requestUrl.pathname.substring(basePath.length);
        const method = event.request.method;

        // Handle API requests
        if (relativePath.startsWith('api/')) {
            const apiPath = relativePath.substring(4); // Remove 'api/'

            // Test routes (handle them BEFORE the other routes)
            if (relativePath.startsWith('test/')) {
                if (relativePath === 'test/get' && method === 'GET') {
                    return event.respondWith(new Response(JSON.stringify({ message: 'GET test successful' }), { headers: { 'Content-Type': 'application/json' } }));
                } else if (relativePath === 'test/post' && method === 'POST') {
                    return event.respondWith(new Response(JSON.stringify({ message: 'POST test successful' }), { headers: { 'Content-Type': 'application/json' } }));
                } else if (relativePath === 'test/put' && method === 'PUT') {
                    return event.respondWith(new Response(JSON.stringify({ message: 'PUT test successful' }), { headers: { 'Content-Type': 'application/json' } }));
                } else if (relativePath === 'test/delete' && method === 'DELETE') {
                    return event.respondWith(new Response(JSON.stringify({ message: 'DELETE test successful' }), { headers: { 'Content-Type': 'application/json' } }));
                }
            }


            if (apiPath === 'data' && method === 'GET') {
                event.respondWith(
                    new Response(JSON.stringify({ message: 'Hello from Service Worker! (data)' }), {
                        headers: { 'Content-Type': 'application/json' }
                    })
                );
           } else if (apiPath === 'users' && method === 'GET') {
                event.respondWith(
                    new Response(JSON.stringify([{ id: 1, name: 'John Doe' }, { id: 2, name: 'Jane Doe' }]), {
                        headers: { 'Content-Type': 'application/json' }
                    })
                );
           }
            else if (apiPath === 'customers' && method === 'POST') {
                event.respondWith(handleCreateCustomer(event.request));
            } else if (apiPath === 'customers' && method === 'GET') {
                event.respondWith(handleGetAllCustomers());
            // Handle Start Quote: /api/customers/:customerId/quotes (POST)
            }else if (apiPath.startsWith('customers/') && apiPath.includes('/quotes') && method === 'POST'){
                const customerId = apiPath.split('/')[1]; // Extract customerId
                event.respondWith(handleStartQuote(customerId, event.request));
            } else if (apiPath.startsWith('customers/') && method === 'GET') {
                const customerId = apiPath.split('/')[1];
                event.respondWith(handleGetCustomer(customerId));
            } else if (apiPath === 'messages' && method === 'POST') {
              event.respondWith(handlePostMessage(event.request));
            }
             else if (apiPath === 'messages' && method === 'GET'){
                event.respondWith(handleGetAllMessages());
            }
             else if (apiPath.startsWith('search') && method === 'GET') {
                const urlParams = new URLSearchParams(requestUrl.search);
                const terms = urlParams.get('terms');
                event.respondWith(handleSearchMessages(terms));
            } else {
                // Request for an API endpoint that's not handled
                console.log('Service Worker: Passing request to network (API endpoint not found):', event.request.url);
                event.respondWith(fetch(event.request));  // Pass to network
            }
       }else {
            // Request for a non-API resource (e.g., HTML, CSS, JS files)
            console.log('Service Worker: Passing request to network (Non-API request):', event.request.url);
            event.respondWith(fetch(event.request));
        }

    } else {
        // Request is not within the base path
        console.log('Service Worker: Passing request to network (not in base path):', event.request.url);
        event.respondWith(fetch(event.request));
    }
});

self.addEventListener('activate', async function(event) {
    console.log('Service Worker activating.');
    event.waitUntil(
        (async () => {
            await openDB();
            await clients.claim();
            testHttpMethods(); //  Run tests *after* activation and DB.
        })()
    );
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

async function handleGetProducts() {
    const products = [
        { id: 'prod-1', name: 'Basic Insurance', description: 'Covers basic needs.' },
        { id: 'prod-2', name: 'Premium Insurance', description: 'Covers everything!' },
    ];
    return new Response(JSON.stringify(products), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleStartQuote(customerId, request) {
    try {
        const body = await request.json();
        if (!db) { // Use the global db variable, and check if it's initialized
            await openDB();
        }
        const customer = await getCustomerFromDB(customerId);
        if (!customer) {
            throw new Error("Customer not found");
        }
        const quoteId = `quote-${Date.now()}`; // Use a timestamp-based ID
        const quoteData = {
            quoteId,
            customerId,
            productId: body.productId, // From the request
            status: 'draft',
            details: {} // Initial details are empty
        };

         const transaction = db.transaction([messageStoreName], 'readwrite');
         const store = transaction.objectStore(messageStoreName);
         const requestAdd = store.add(quoteData); // IndexedDB will auto-generate a key

          requestAdd.onsuccess = () => {
            console.log('Quote added to IndexedDB:', requestAdd.result); // result will be the key
          };

          requestAdd.onerror = (event) => {
            console.error('Error adding Quote to IndexedDB:', event.target.error);
          };

        return new Response(JSON.stringify({ quoteId }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("Error handling start quote:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
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