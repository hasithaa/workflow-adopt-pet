import ballerina/http;
import ballerina/log;
import ballerina/lang.runtime as runtime;

configurable string workflowCallbackUrl = "http://localhost:8080/adoption/branch-ready";
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
    string orderId;
    string referenceID;
    int selectedPetId;
    string selectedPetName;
    string pickupPreference;
    string? requestId;
    string? callbackUrl;
    int? confirmationDelaySeconds;
|};

type AdoptionRequestAccepted record {| 
    int status;
|};

type AdoptionRequestContext record {| 
    string referenceID;
    string requestId;
    int orderId;
    int petId;
    string petName;
|};

type BranchReadyNotification record {| 
    string eventType;
    string referenceID;
    int orderId;
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
    {id: 2003, name: "Kiwi", status: "pending", category: "Birds", price: 49.50}
];

service /api/v1 on petsListener {
    resource function get pets(string status = "available", string? category = ()) returns PetSearchResponse {
        Pet[] matchingPets = [];
        foreach Pet pet in pets {
            boolean matchesStatus = pet.status == status;
            boolean matchesCategory = category is string ? pet.category == category : true;
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

service /api/v1 on ordersListener {
    resource function post adoption\-requests(@http:Payload SubmitAdoptionRequest request) returns AdoptionRequestAccepted|http:InternalServerError {
        int|error orderIdValue = 'int:fromString(request.orderId);
        if orderIdValue is error {
            log:printError("Invalid orderId received in adoption request", 'error = orderIdValue);
            return <http:InternalServerError>{body: {message: "Invalid orderId"}};
        }

        int orderId = orderIdValue;
        string requestId = request.requestId ?: request.referenceID;
        AdoptionRequestContext context = {
            referenceID: request.referenceID,
            requestId: requestId,
            orderId: orderId,
            petId: request.selectedPetId,
            petName: request.selectedPetName
        };

        string callbackUrl = request.callbackUrl ?: workflowCallbackUrl;
        int delaySeconds = request.confirmationDelaySeconds ?: confirmationDelaySeconds;
        _ = start sendBranchReadyNotification(callbackUrl, delaySeconds, context);

        log:printInfo(string `Submitted adoption request for reference ${request.referenceID}. Scheduled branch-ready callback to ${callbackUrl}`);
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

isolated function sendBranchReadyNotification(string callbackUrl, int delaySeconds, AdoptionRequestContext adoptionRequest) returns error? {
    int remainingSeconds = delaySeconds;
    while remainingSeconds > 0 {
        log:printInfo(string `Sending branch-ready notification for request ${adoptionRequest.requestId} in ${remainingSeconds}s to ${callbackUrl}`);
        runtime:sleep(1.0);
        remainingSeconds -= 1;
    }

    BranchReadyNotification payload = {
        eventType: "adoption.order.branch.ready",
        referenceID: adoptionRequest.referenceID,
        orderId: adoptionRequest.orderId,
        requestId: adoptionRequest.requestId,
        petId: adoptionRequest.petId,
        petName: adoptionRequest.petName,
        status: "READY_FOR_PICKUP"
    };

    log:printInfo(string `Sending branch-ready notification for reference ${adoptionRequest.referenceID} to ${callbackUrl}`);
    http:Client callbackClient = check new (callbackUrl);
    http:Response response = check callbackClient->post("", payload);
    log:printInfo(string `Workflow callback completed with status ${response.statusCode}`);
}
