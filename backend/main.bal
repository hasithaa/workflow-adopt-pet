import ballerina/http;
import ballerina/io;
import ballerina/log;
import ballerina/lang.runtime;

configurable int confirmationDelaySeconds = 30;

listener http:Listener petsListener = new (9001);
listener http:Listener ordersListener = new (9002);
listener http:Listener notificationsListener = new (9003);

type Pet record {| 
    int id;
    string name;
    string status;
    string category;
    decimal price;
|};

type PetSearchResponse record {| 
    string preferredStatus;
    string? preferredCategory;
    int petsFound;
    Pet[] results;
|};

type SubmitAdoptionRequest record {| 
    string requestId;
    string callbackId;
    int selectedPetId;
    string selectedPetName;
    string pickupPreference;
    string? callbackUrl;
    int? confirmationDelaySeconds;
|};

type AdoptionRequestAccepted record {| 
    int status;
|};

type AdoptionRequestContext record {| 
    string callbackId;
    string requestId;
    int petId;
    string petName;
|};

type BranchReadyNotification record {| 
    string eventType;
    string referenceID;
    string requestId;
    int petId;
    string petName;
    string status;
|};

type SendConfirmationRequest record {| 
    string requestId;
    int orderId;
    string petName;
    string branchName;
    string readyAt;
    string message;
|};

type NotificationResponse record {| 
    string id;
    boolean delivered;
|};

final Pet[] pets = [
    {id: 2001, name: "Luna", status: "available", category: "Dogs", price: 125.50},
    {id: 2002, name: "Milo", status: "available", category: "Dogs", price: 99.99},
    {id: 2003, name: "Kiwi", status: "pending", category: "Birds", price: 49.50},
    {id: 2004, name: "Lily", status: "available", category: "Cats", price: 110.00},
    {id: 2005, name: "Oreo", status: "available", category: "Cats", price: 95.00}
];

service /api/v1 on petsListener {
    resource function get pets(string status = "available", string? category = ()) returns PetSearchResponse {
        Pet[] matchingPets = [];
        string? normalizedInputCategory = normalizeCategory(category);
        foreach Pet pet in pets {
            boolean matchesStatus = pet.status == status;
            boolean matchesCategory = normalizedInputCategory is string ? normalizeCategory(pet.category) == normalizedInputCategory : true;
            if matchesStatus && matchesCategory {
                matchingPets.push(pet);
            }
        }

        log:printInfo(string `Returning ${matchingPets.length()} pets for status=${status}, category=${category ?: "ANY"}`);
        return {
            preferredStatus: status,
            preferredCategory: category,
            petsFound: matchingPets.length(),
            results: matchingPets
        };
    }
}

isolated function normalizeCategory(string? category) returns string? {
    if category is () {
        return ();
    }

    string c = category.toLowerAscii().trim();
    if c == "dog" || c == "dogs" {
        return "dog";
    }
    if c == "cat" || c == "cats" {
        return "cat";
    }

    return c;
}

service /api/v1 on ordersListener {
    resource function post adoption\-requests(@http:Payload SubmitAdoptionRequest request) returns AdoptionRequestAccepted {
        AdoptionRequestContext context = {
            callbackId: request.callbackId,
            requestId: request.requestId,
            petId: request.selectedPetId,
            petName: request.selectedPetName
        };

        string? callbackUrl = request.callbackUrl;
        int delaySeconds = request.confirmationDelaySeconds ?: confirmationDelaySeconds;
        _ = start printBranchReadyInstructions(callbackUrl, delaySeconds, context);
        return {status: 201};
    }
}

service /api/v1 on notificationsListener {
    resource function post notifications(@http:Payload SendConfirmationRequest request) returns NotificationResponse {
        log:printInfo(string `Received send-confirmation request for order ${request.orderId}, requestId=${request.requestId}`);
        return {
            id: "notif-3001",
            delivered: true
        };
    }
}

isolated function printBranchReadyInstructions(string? callbackUrl, int delaySeconds, AdoptionRequestContext adoptionRequest) {

    int remainingSeconds = delaySeconds;
    while remainingSeconds > 0 {
        log:printInfo(string `Branch preparing request ${adoptionRequest.requestId} (${adoptionRequest.petName}); callback instructions in ${remainingSeconds}s`);
        runtime:sleep(1.0);
        remainingSeconds -= 1;
    }

    BranchReadyNotification payload = {
        eventType: "adoption.order.branch.ready",
        referenceID: adoptionRequest.callbackId,
        requestId: adoptionRequest.requestId,
        petId: adoptionRequest.petId,
        petName: adoptionRequest.petName,
        status: "READY_FOR_PICKUP"
    };

    string callbackTarget = callbackUrl ?: string `http://localhost:9080/workflow/Bookings/${adoptionRequest.callbackId}`;
    string payloadJson = payload.toJsonString();
    io:println("");
    io:println("────────────────────────────────────────────────────────────────────");
    io:println(string `  SHELTER WORKER ACTION — request ${adoptionRequest.requestId} (${adoptionRequest.petName}) is ready for pickup.`);
    io:println("  Invoke the Step 6 callback service with this payload to resume the workflow run:");
    io:println(string `  Callback HTTP service: POST ${callbackTarget}  (body: BookingCallback)`);
    io:println(string `      curl -X POST '${callbackTarget}' -H 'Content-Type: application/json' -d '${payloadJson}'`);
    io:println("────────────────────────────────────────────────────────────────────");
    io:println(payloadJson);
    io:println("────────────────────────────────────────────────────────────────────");
    io:println("");
}
