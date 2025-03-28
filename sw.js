// sw.js
/*jshint esversion: 6 */
/*jshint worker: true */
let memoryStore = {
    quotes: {},
    policies: {},
    claims: {}
  };


// ---- Agregado esto para gestión de mocks 
const mockRoutes = [
  { method: "POST", path: "/api/data" },
  { method: "GET", path: "/products" },
  { method: "GET", path: "/api/customers" },
  { method: "GET", path: "/api/customers/:customerId" },
  { method: "POST", path: "/api/customers/:customerId/quotes" },
  { method: "PUT", path: "/api/customers/:customerId/quotes/:quoteId" },
  { method: "POST", path: "/api/customers/:customerId/quotes/:quoteId/calculate" },
  { method: "POST", path: "/api/customers/:customerId/quotes/:quoteId/accept" },
  { method: "GET", path: "/api/customers/:customerId/policies/:policyId" },
  { method: "GET", path: "/api/customers/:customerId/policies/:policyId/renewal" },
  { method: "POST", path: "/api/customers/:customerId/policies/:policyId/renew" },
  { method: "POST", path: "/api/customers/:customerId/claims" },
  { method: "GET", path: "/api/customers/:customerId/claims/:claimId" },
  { method: "GET", path: "/api/debug/policies" },
  { method: "GET", path: "/api/debug/claims" },
  { method: "GET", path: "/api/messages" },
  { method: "POST", path: "/api/messages" },
  { method: "GET", path: "/api/search?terms=" }
];
// ----
  
  let nextQuoteId = 1;
  let nextPolicyId = 1;
  let nextClaimId = 1;

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

        // --- Test routes ---
        if (relativePath.startsWith('test/')) {
            if (relativePath === 'test/get' && method === 'GET') {
                return event.respondWith(new Response(JSON.stringify({ message: 'GET test successful' })));
            } else if (relativePath === 'test/post' && method === 'POST') {
                return event.respondWith(new Response(JSON.stringify({ message: 'POST test successful' })));
            } else if (relativePath === 'test/put' && method === 'PUT') {
                return event.respondWith(new Response(JSON.stringify({ message: 'PUT test successful' })));
            } else if (relativePath === 'test/delete' && method === 'DELETE') {
                return event.respondWith(new Response(JSON.stringify({ message: 'DELETE test successful' })));
            }
        }

        // --- Standalone route: /products ---
        if (relativePath === 'products' && method === 'GET') {
            return event.respondWith(handleGetProducts());
        }


            // ---- Agregado esto para gestión de mocks 
        if (relativePath === '__mocks' && method === 'GET') {
          return event.respondWith(new Response(JSON.stringify(mockRoutes), {
            headers: { 'Content-Type': 'application/json' }
          }));
        }
            // ----
        
        // --- API Routes ---
        if (relativePath.startsWith('api/')) {
            const apiPath = relativePath.substring(4); // Remove 'api/'
        
           

            // Create Customer (POST)
            if (apiPath === 'data' && method === 'POST') {
                return event.respondWith(handleCreateCustomer(event.request));
            }

            // Get all customers
            if (apiPath === 'customers' && method === 'GET') {
                return event.respondWith(handleGetAllCustomers());
            }

            // Get specific customer
            if (apiPath.match(/^customers\/[^/]+$/) && method === 'GET') {
                const customerId = apiPath.split('/')[1];
                return event.respondWith(handleGetCustomer(customerId));
            }

            // POST /customers/:customerId/quotes
            if (apiPath.match(/^customers\/[^/]+\/quotes$/) && method === 'POST') {
                const [, customerId] = apiPath.split('/');
                return event.respondWith(handleStartQuote(customerId, event.request));
            }

            // PUT /customers/:customerId/quotes/:quoteId
            if (apiPath.match(/^customers\/[^/]+\/quotes\/[^/]+$/) && method === 'PUT') {
                const [, customerId, , quoteId] = apiPath.split('/');
                return event.respondWith(handleUpdateQuote(customerId, quoteId, event.request));
            }

            // POST /customers/:customerId/quotes/:quoteId/calculate
            if (apiPath.match(/^customers\/[^/]+\/quotes\/[^/]+\/calculate$/) && method === 'POST') {
                const parts = apiPath.split('/');
                return event.respondWith(handleCalculatePremium(parts[1], parts[3]));
            }

            // POST /customers/:customerId/quotes/:quoteId/accept
            if (apiPath.match(/^customers\/[^/]+\/quotes\/[^/]+\/accept$/) && method === 'POST') {
                const parts = apiPath.split('/');
                return event.respondWith(handleAcceptQuote(parts[1], parts[3], event.request));
            }

            // GET /customers/:customerId/policies/:policyId
            if (apiPath.match(/^customers\/[^/]+\/policies\/[^/]+$/) && method === 'GET') {
                const parts = apiPath.split('/');
                return event.respondWith(handleGetPolicy(parts[1], parts[3]));
            }

            // POST /customers/:customerId/claims
            if (apiPath.match(/^customers\/[^/]+\/claims$/) && method === 'POST') {
                const [, customerId] = apiPath.split('/');
                return event.respondWith(handleFileClaim(customerId, event.request));
            }

            // GET /customers/:customerId/claims/:claimId
            if (apiPath.match(/^customers\/[^/]+\/claims\/[^/]+$/) && method === 'GET') {
                const [, customerId, , claimId] = apiPath.split('/');
                return event.respondWith(handleGetClaim(customerId, claimId));
            }

            // GET /customers/:customerId/policies/:policyId/renewal
            if (apiPath.match(/^customers\/[^/]+\/policies\/[^/]+\/renewal$/) && method === 'GET') {
                const [, customerId, , policyId] = apiPath.split('/');
                return event.respondWith(handleGetRenewalInfo(customerId, policyId));
            }

            // POST /customers/:customerId/policies/:policyId/renew
            if (apiPath.match(/^customers\/[^/]+\/policies\/[^/]+\/renew$/) && method === 'POST') {
                const [, customerId, , policyId] = apiPath.split('/');
                return event.respondWith(handleRenewPolicy(customerId, policyId, event.request));
            }

            // Messages
            if (apiPath === 'messages' && method === 'POST') {
                return event.respondWith(handlePostMessage(event.request));
            }

            if (apiPath === 'messages' && method === 'GET') {
                return event.respondWith(handleGetAllMessages());
            }

            // Search
            if (apiPath.startsWith('search') && method === 'GET') {
                const urlParams = new URLSearchParams(requestUrl.search);
                const terms = urlParams.get('terms');
                return event.respondWith(handleSearchMessages(terms));
            }


                        // DEBUG: Get all policies
            if (apiPath === 'debug/policies' && method === 'GET') {
                return event.respondWith(handleDebugPolicies());
            }

            // DEBUG: Get all claims
            if (apiPath === 'debug/claims' && method === 'GET') {
                return event.respondWith(handleDebugClaims());
            }


            // If nothing matched
            console.log('Service Worker: API endpoint not found, passing to network:', requestUrl.pathname);
            return event.respondWith(fetch(event.request));
        }

        // Other static assets (HTML, CSS, JS, images)
        console.log('Service Worker: Static asset or unknown path, passing to network:', requestUrl.pathname);
        event.respondWith(fetch(event.request));
    } else {
        // Outside of service worker base path
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

async function handleGetCustomer(customerId) {
    try {
        const customer = await getCustomerFromDB(customerId);

        if (customer) {
            return new Response(JSON.stringify(customer), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({ error: 'Customer not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        console.error('Service Worker: Error in handleGetCustomer:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleGetAllCustomers() {
    try {
        const customers = await getAllCustomersFromDB();
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

async function handlePostMessage(request) {
  try {
    const messageText = await request.text(); // Get raw text first
    const messageData = JSON.parse(messageText); // THEN parse
    const currentSize = await calculateTotalSize();
    if (currentSize + messageText.length > 3000) {
      return new Response(JSON.stringify({ error: 'Adding this message would exceed the 3000 character limit.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const messageId = await addMessageToDB(messageData);
    return new Response(JSON.stringify({ messageId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Service Worker: Error in handlePostMessage:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, // Or appropriate error code
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// New handler function to retrieve all messages
async function handleGetAllMessages() {
    try {
        const messages = await getAllMessagesFromDB();
        return new Response(JSON.stringify(messages), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Service Worker: Error in handleGetAllMessages:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleSearchMessages(terms) {
  try {
    const results = await searchData(terms);
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Service Worker: Error in handleSearchMessages:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


//Added to manage the logic of the fake API
async function handleGetProducts(){
    const products = [
        { id: 'prod-1', name: 'Basic Insurance', description: 'Covers basic needs.' },
        { id: 'prod-2', name: 'Premium Insurance', description: 'Covers everything!' },
    ];
    return new Response(JSON.stringify(products), {
        headers: { 'Content-Type': 'application/json' }
    });
}


async function handleStartQuote(customerId, request){
    console.log(customerId);
     const body = await request.json();
     console.log(body)
     const customer = await getCustomerFromDB(customerId);
     if (!customer) {
         throw new Error("Customer not found");
     }
    const quoteId = `quote${nextQuoteId++}`;
    memoryStore.quotes[quoteId] = {
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
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
    if (!memoryStore.quotes[quoteId]) {
        throw new Error("Quote not found");
    }
    const body = await request.json();
    memoryStore.quotes[quoteId].details = { ...memoryStore.quotes[quoteId].details, ...body }; //Update the details
    return new Response(JSON.stringify({success: true}), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleCalculatePremium(customerId, quoteId){
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
    if (!memoryStore.quotes[quoteId]) {
        throw new Error("Quote not found");
    }
    //Very simple mock calculation
    const premium = Math.floor(Math.random() * 1000) + 500; //Random between 500 - 1500
    memoryStore.quotes[quoteId].premium = premium;
    memoryStore.quotes[quoteId].status = 'calculated';

    return new Response(JSON.stringify({ premium: premium }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleAcceptQuote(customerId, quoteId, request){
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
    if (!memoryStore.quotes[quoteId]) {
        throw new Error("Quote not found");
    }
    if(memoryStore.quotes[quoteId].status !== 'calculated'){
        throw new Error("Quote is not in 'calculated' status. Cannot accept.");
    }
    const policyId = `policy${nextPolicyId++}`;
    memoryStore.policies[policyId] = {
        policyId,
        customerId,
        quoteId,
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString() // One year later
    };

     //Clean quote
    delete memoryStore.quotes[quoteId];

    return new Response(JSON.stringify({ policyId }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetPolicy(customerId, policyId){
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
   if (!memoryStore.policies[policyId]) {
        throw new Error("Policy not found");
    }
    return new Response(JSON.stringify(memoryStore.policies[policyId]), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleFileClaim(customerId, request){
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
    const body = await request.json();
    if(!memoryStore.policies[body.policyId]){
         throw new Error("Policy not found");
    }

    const claimId = `claim${nextClaimId++}`; // Simple ID generation
    memoryStore.claims[claimId] = {
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
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
    if (!memoryStore.claims[claimId]) {
        throw new Error("Claim not found");
    }

    return new Response(JSON.stringify(memoryStore.claims[claimId]), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleGetRenewalInfo(customerId, policyId){
    const customer = await getCustomerFromDB(customerId);
    if (!customer) {
        throw new Error("Customer not found");
    }
    if (!memoryStore.policies[policyId]) {
        throw new Error("Policy not found");
    }

    const policy = memoryStore.policies[policyId];
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

async function handleRenewPolicy(customerId, policyId, request) {
    try {
        const customer = await getCustomerFromDB(customerId);
        if (!customer) {
            throw new Error("Customer not found");
        }

        const policy = memoryStore.policies[policyId];
        if (!policy) {
            throw new Error("Policy not found");
        }

        const endDate = new Date(policy.endDate);
        const now = new Date();
        const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays > 30) {
            return new Response(JSON.stringify({ 
                error: "Policy is not renewable yet", 
                daysRemaining: diffDays 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Update policy dates
        policy.startDate = endDate.toISOString();
        policy.endDate = new Date(new Date(endDate).setFullYear(endDate.getFullYear() + 1)).toISOString();

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error("handleRenewPolicy error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleDebugPolicies() {
    return new Response(JSON.stringify(memoryStore.policies, null, 2), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleDebugClaims() {
    return new Response(JSON.stringify(memoryStore.claims, null, 2), {
        headers: { 'Content-Type': 'application/json' }
    });
}


