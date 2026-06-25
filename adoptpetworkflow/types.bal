
public type WorkflowInput record {|
    string requestId;
    string preferredCategory;
    string pickupPreference;
    string initiatedBy;
    string initiatorRole;
|};

public type ResultsItem record {|
    int id;
    string name;
    string status;
    string category;
    decimal price;
|};

public type PetSearchResult record {|
    string preferredStatus;
    string preferredCategory;
    int petsFound;
    ResultsItem[] results;
|};

public type SelectPetResponse record {|
    int selectedPetId;
    string selectedPetName;
|};

public type ShelterAdminResponse record {|
    boolean approved;
    int orderId;
    string comment;
|};

public type ShelterAdminReview record {|
    string requestId;
    int petId;
    string petName;
    string pickupPreference;
|};

public type BookingCallback record {|
    string eventType;
    string referenceID;
    string requestId;
    int petId;
    string petName;
    string status;
|};
