### Getting Started
Take your first steps to integrating with the API

The API is a REST API. Generally, we use resource URLs for our endpoints. We accept both form-encoded and JSON inputs, and return JSON-encoded results.

The API does not currently have a test environment.

Base URL
The URL for all the endpoints listed in the document follow this pattern:

https://YOUR_COMPANY_DOMAIN/api/ENDPOINT
So a GET request to list the users of an account would look like this:

GET https://portal.yourcompany.com/api/users
Headers
If you are sending JSON data to the API, you must add the Content-Type header to the request:

Content-Type: application/json
You should also set the Accept header to ensure that you receive a JSON response from the API:

Accept: application/json

### Authentication
A guide on how to authenticate your API requests

The API uses API keys to authentication your requests. You can generate an API key for your user account by visiting your user settings page at (YOUR SUBDOMAIN)/settings#api. You can browse there by clicking the user icon at the top left of the page, then clicking Your Settings, then navigating to the API tab.

Creating a Token
To create a token, enter a unique name to help you remember why you created the token. Then, click Create Token. The API token will be displayed on the page, and it will only be displayed once so make sure you copy the value and store it securely.

Revoking a Token
If you are no longer using a token, or if the token has been compromised, you can revoke a token at any time from the same page. Find the token in your list of API tokens and click the red Trash icon.

Authenticating a Request
To authenticate a request to the API, you can either provide the token in the request headers:

Authorization: Bearer YOUR_TOKEN
or via a request parameter named api_token.

### Merchant Header
Set a header to return results for a specific merchant

For any request you make that could involve results from multiple merchants, or for endpoint that require a merchant to be selected, use the X-Selected-Client-Id header with the merchant ID as the value of the header.

X-Selected-Client-Id: 405
For example, if you would like a list of all outbound shipments but only for a specific merchant, passing their merchant ID in the X-Selected-Client-Id parameter will only return shipments related to that merchant.

By default, results requested by a service provider will contain records related to all merchants.

Note: Merchants making a request to the API almost always need to have this header set

### Pagination
Retreive results when there are multiple pages available

Some requests will return a paginated set of results, and you can retrieve more pages by incrementing the page query parameter.

The data from the request will be returned in the data key. The following keys will also be present on the request:

current_page - The page returned in this request
from - The start of the range for this request
to - The end of the range for this request
total - The total number of results available on all pages
last_page - The index of the last page
per_page - The maximum number of results returned per page

### Search Language
A language to filter results in endpoints that support the search language

The search language filter syntax provides a powerful way to filter API results. Use this query language to narrow down results based on specific field values.

Use the q query parameter to specify the search language filter syntax.

Each endpoint has a list of supported fields which you will need to consult to determine which fields are available for filtering.

Basic Syntax
q={FIELD}{OPERATOR}"{VALUE}" {AND|OR} {FIELD}{OPERATOR}"{VALUE}" ...
Ensure that the value is enclosed in double quotes.

Examples
name:"John"
created_at>"2023-01-01"
status!:"inactive"
Supported Operators
Operator	Description	Example
:	Equals	name:"Smith"
!:	Not equals	status!:"deleted"
~	Contains	tags~"urgent"
!~	Does not contain	description!~"draft"
>	Greater than	price>"50"
<	Less than	stock<"10"
>=	Greater than or equal to	rating>="4"
<=	Less than or equal to	priority<="3"
Combining Filters
Connect multiple conditions using AND or OR:

status:"active" AND created_at>"2023-01-01"
priority:"high" OR due_date<:"2023-12-31"
Relationship Filtering
Access related resources using dot notation:

user.name:"John"
order.items.count>"5"
Notes
Parentheses grouping is not supported
All conditions are evaluated left-to-right
Values must be enclosed in double quotes
Example API Usage
GET /api/channels/listings?q=title:"Chair" AND title:"Table"

### Listings
Index Listings
Get a list of all listings for a channel. Returns up to 100 items in a single call, using Pagination.

This endpoint also supports our Search Language. Supported fields are title, sku, channel_identifier, identifiers.identifier, productLink.product_id.

GET
/channels/{CHANNEL_ID}/listings
Example Response
Create Listing
Create a new listing on a channel for an inventory item

POST
/channels/{CHANNEL_ID}/listings
Parameter	Type	Examples	Description
{
  "data": [
    {
      "id": 21,
      "created_at": "2025-03-10T04:02:47Z",
      "updated_at": "2025-03-10T09:22:27Z",
      "channel_id": 1,
      "sku": "Digital-A-433828",
      "title": "Digital Alarm Clock",
      "condition": null,
      "condition_note": null,
      "channel_identifier": "Digital-A-433828",
      "length_mm": null,
      "width_mm": null,
      "height_mm": null,
      "weight_gm": null,
      "status": "synced",
      "flags": [],
      "identifiers": [
        {
          "id": 61,
          "listing_id": 21,
          "identifier": "6619524668697",
          "type": "EAN"
        },
        {
          "id": 62,
          "listing_id": 21,
          "identifier": "B05A8AUTY0",
          "type": "ASIN"
        },
        {
          "id": 63,
          "listing_id": 21,
          "identifier": "X00DOPEZDA",
          "type": "FNSKU"
        }
      ],
      "images": [
        {
          "id": 21,
          "listing_id": 21,
          "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=21",
          "thumbnail_url": "data:image/png;base64,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"
        }
      ],
      "product_link": {
        "id": 175,
        "created_at": "2025-03-12T07:11:44Z",
        "listing_id": 21,
        "product_id": 21
      }
    },
    {
      "id": 22,
      "created_at": "2025-03-10T04:02:47Z",
      "updated_at": "2025-03-10T09:22:27Z",
      "channel_id": 1,
      "sku": "Carbon-Filt-836636",
      "title": "Carbon Filter Face Mask",
      "condition": null,
      "condition_note": null,
      "channel_identifier": "Carbon-Filt-836636",
      "length_mm": null,
      "width_mm": null,
      "height_mm": null,
      "weight_gm": null,
      "status": "synced",
      "flags": [],
      "identifiers": [
        {
          "id": 64,
          "listing_id": 22,
          "identifier": "4863963343663",
          "type": "EAN"
        },
        {
          "id": 65,
          "listing_id": 22,
          "identifier": "B01S7JNPV5",
          "type": "ASIN"
        },
        {
          "id": 66,
          "listing_id": 22,
          "identifier": "X00MD79WLI",
          "type": "FNSKU"
        }
      ],
      "images": [
        {
          "id": 22,
          "listing_id": 22,
          "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=22",
          "thumbnail_url": "data:image/png;base64,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"
        }
      ],
      "product_link": {
        "id": 176,
        "created_at": "2025-03-12T07:11:44Z",
        "listing_id": 22,
        "product_id": 22
      }
    }
  ],
  "total": 2,
  "current_page": 1,
  "last_page": 1,
  "per_page": 20,
  "from": 1,
  "to": 2
}
item_id
Required
integer	22	(required) ID of the item you are creating a listing for.
channel_identifier
Required
string	ABC-1234	(required) The unique identifier for the item on the channel. This is generally, but not required to be, the SKU of the item.
item_exists
Optional
string	yes	Whether the listing already exists on the channel. If yes, we will attempt to sync with the listing on the channel. If no, we will attempt to create the listing on the channel. Valid values: 'yes', 'no'.
Example Response
Link a Listing to a Product
Create a link between a product/item and a listing on a channel.

POST
/listings/{LISTING_ID}/link
Parameter	Type	Examples	Description
{
  "data": {
    "id": 1485,
    "created_at": "2025-03-12T09:01:36Z",
    "updated_at": "2025-03-12T09:01:36Z",
    "channel_id": 1,
    "sku": "Rotating-M-949927",
    "title": "Rotating Makeup Organizer",
    "condition": null,
    "condition_note": null,
    "channel_identifier": "Rotating-M-9499272",
    "length_mm": null,
    "width_mm": null,
    "height_mm": null,
    "weight_gm": null,
    "status": "checking",
    "flags": [],
    "identifiers": [],
    "images": [],
    "product_link": null
  }
}
item_id
Required
integer	22	(required) ID of the product/item you would like to link to this listing.
Example Response
{
  "message": "Listing linked to item"
}

### Charges
For any call on this page, you are required to set the merchant using the Merchant Header.

Index
View a list of charges for a merchant using Pagination.

GET
/billing/charges
Example Response
{
  "data": [
    {
      "id": 11,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.943180Z",
      "currency": "USD",
      "price": 521,
      "status": "Invoiced",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Quantum Dynamics.",
      "amount": 521,
      "stripe_invoice_item_id": null
    },
    {
      "id": 10,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.907608Z",
      "currency": "USD",
      "price": 257.75,
      "status": "Invoiced",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Zephyr Zenith.",
      "amount": 257.75,
      "stripe_invoice_item_id": null
    },
    {
      "id": 9,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.872304Z",
      "currency": "USD",
      "price": 135.3,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Crescent Cosmos.",
      "amount": 135.3,
      "stripe_invoice_item_id": null
    },
    {
      "id": 8,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.810145Z",
      "currency": "USD",
      "price": 349.5,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Infinite Insights.",
      "amount": 349.5,
      "stripe_invoice_item_id": null
    },
    {
      "id": 7,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.769526Z",
      "currency": "USD",
      "price": 382.7,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Yonder Yottabytes.",
      "amount": 382.7,
      "stripe_invoice_item_id": null
    },
    {
      "id": 6,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.735953Z",
      "currency": "USD",
      "price": 261,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Crescent Cosmos.",
      "amount": 261,
      "stripe_invoice_item_id": null
    },
    {
      "id": 5,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.695010Z",
      "currency": "USD",
      "price": 380.4,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Crescent Cosmos.",
      "amount": 380.4,
      "stripe_invoice_item_id": null
    },
    {
      "id": 4,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.665053Z",
      "currency": "USD",
      "price": 94.3,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Infinite Insights.",
      "amount": 94.3,
      "stripe_invoice_item_id": null
    },
    {
      "id": 3,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.639337Z",
      "currency": "USD",
      "price": 159.8,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Infinite Insights.",
      "amount": 159.8,
      "stripe_invoice_item_id": null
    },
    {
      "id": 2,
      "charger_id": 8617,
      "charger_type": "company",
      "chargee_id": 6320,
      "chargee_type": "team",
      "created_at": "2026-01-08T16:42:25.614445Z",
      "currency": "USD",
      "price": 209.1,
      "status": "Open",
      "category": "OutboundShipment",
      "description": "Services charges for outbound shipment: Vanguard Visions.",
      "amount": 209.1,
      "stripe_invoice_item_id": null
    }
  ],
  "total": 11,
  "current_page": 1,
  "last_page": 2,
  "per_page": 10,
  "from": 0,
  "to": 10
}

Show
Show the details of a single charge for a merchant. You can find the charge ID in the response of the Index call.

GET
/billing/charges/{CHARGE_ID}
Example Response
{
  "charge": {
    "id": 67,
    "charger_id": "1",
    "charger_type": "company",
    "chargee_id": "1",
    "chargee_type": "team",
    "created_at": "2023-08-31T14:00:39.000000Z",
    "currency": "USD",
    "price": 1.24,
    "status": "Open",
    "category": "OutboundShipment",
    "description": "Services charges for outbound shipment (FBA ID: FBA0LUMFEZQ3W): receive outbound.",
    "amount": 1.24,
    "stripe_invoice_item_id": null
  },
  "charge_items": [
    {
      "id": 904,
      "charge_id": 67,
      "parent_id": 902,
      "chargeable_item": {
        "id": 2,
        "created_at": "2023-08-23T13:18:36.000000Z",
        "updated_at": "2023-08-25T23:01:24.000000Z",
        "name": "Thick Poly Bags (3mm)",
        "type": "outbound_shipment_item",
        "unit": "bag",
        "when_to_charge": "attached",
        "charge": "0.2500",
        "advanced_options": null,
        "service_provider_id": 1,
        "price_records": [],
        "archived_at": "2023-08-25T23:01:24.000000Z"
      },
      "chargeable_item_id": "2",
      "chargeable_item_type": "company-service",
      "description": "Thick Poly Bags (3mm)",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0.25,
      "line_price_amount": 0.25
    },
    {
      "id": 901,
      "charge_id": 67,
      "parent_id": null,
      "chargeable_item": "...",
      "chargeable_item_id": "66",
      "chargeable_item_type": "outbound-shipment",
      "description": "Outbound Shipment, FBA ID: FBA0LUMFEZQ3W",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0,
      "line_price_amount": 0
    },
    {
      "id": 902,
      "charge_id": 67,
      "parent_id": 901,
      "chargeable_item": "...",
      "chargeable_item_id": "368",
      "chargeable_item_type": "outbound-shipment-item",
      "description": "Digital Bathroom Scale",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0,
      "line_price_amount": 0
    },
    {
      "id": 903,
      "charge_id": 67,
      "parent_id": 902,
      "chargeable_item": {
        "id": 5,
        "created_at": "2023-08-23T13:18:36.000000Z",
        "updated_at": "2023-08-23T13:18:36.000000Z",
        "name": "Base Per Outbound Shipment Item",
        "type": "outbound_shipment_item",
        "unit": "item",
        "when_to_charge": "always",
        "charge": "0.9900",
        "advanced_options": null,
        "service_provider_id": 1,
        "price_records": [],
        "archived_at": null
      },
      "chargeable_item_id": "5",
      "chargeable_item_type": "company-service",
      "description": "Base Per Outbound Shipment Item",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0.99,
      "line_price_amount": 0.99
    }
  ]
}
Create Quick Adjustment
Create a quick adjustment on a client's account.

POST
/billing/charges/quick-adjustment
Parameter	Type	Examples	Description
{
  "charge": {
    "id": 67,
    "charger_id": "1",
    "charger_type": "company",
    "chargee_id": "1",
    "chargee_type": "team",
    "created_at": "2023-08-31T14:00:39.000000Z",
    "currency": "USD",
    "price": 1.24,
    "status": "Open",
    "category": "OutboundShipment",
    "description": "Services charges for outbound shipment (FBA ID: FBA0LUMFEZQ3W): receive outbound.",
    "amount": 1.24,
    "stripe_invoice_item_id": null
  },
  "charge_items": [
    {
      "id": 904,
      "charge_id": 67,
      "parent_id": 902,
      "chargeable_item": {
        "id": 2,
        "created_at": "2023-08-23T13:18:36.000000Z",
        "updated_at": "2023-08-25T23:01:24.000000Z",
        "name": "Thick Poly Bags (3mm)",
        "type": "outbound_shipment_item",
        "unit": "bag",
        "when_to_charge": "attached",
        "charge": "0.2500",
        "advanced_options": null,
        "service_provider_id": 1,
        "price_records": [],
        "archived_at": "2023-08-25T23:01:24.000000Z"
      },
      "chargeable_item_id": "2",
      "chargeable_item_type": "company-service",
      "description": "Thick Poly Bags (3mm)",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0.25,
      "line_price_amount": 0.25
    },
    {
      "id": 901,
      "charge_id": 67,
      "parent_id": null,
      "chargeable_item": "...",
      "chargeable_item_id": "66",
      "chargeable_item_type": "outbound-shipment",
      "description": "Outbound Shipment, FBA ID: FBA0LUMFEZQ3W",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0,
      "line_price_amount": 0
    },
    {
      "id": 902,
      "charge_id": 67,
      "parent_id": 901,
      "chargeable_item": "...",
      "chargeable_item_id": "368",
      "chargeable_item_type": "outbound-shipment-item",
      "description": "Digital Bathroom Scale",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0,
      "line_price_amount": 0
    },
    {
      "id": 903,
      "charge_id": 67,
      "parent_id": 902,
      "chargeable_item": {
        "id": 5,
        "created_at": "2023-08-23T13:18:36.000000Z",
        "updated_at": "2023-08-23T13:18:36.000000Z",
        "name": "Base Per Outbound Shipment Item",
        "type": "outbound_shipment_item",
        "unit": "item",
        "when_to_charge": "always",
        "charge": "0.9900",
        "advanced_options": null,
        "service_provider_id": 1,
        "price_records": [],
        "archived_at": null
      },
      "chargeable_item_id": "5",
      "chargeable_item_type": "company-service",
      "description": "Base Per Outbound Shipment Item",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0.99,
      "line_price_amount": 0.99
    }
  ]
}
amount
Required
integer	199.99	(required) The amount for the quick adjustment.
description
Required
string	Services for custom packing	(required) The description for the quick adjustment.
Example Response
{
  "charge": {
    "id": 67,
    "charger_id": "1",
    "charger_type": "company",
    "chargee_id": "1",
    "chargee_type": "team",
    "created_at": "2023-08-31T14:00:39.000000Z",
    "currency": "USD",
    "price": 1.24,
    "status": "Open",
    "category": "OutboundShipment",
    "description": "Services charges for outbound shipment (FBA ID: FBA0LUMFEZQ3W): receive outbound.",
    "amount": 1.24,
    "stripe_invoice_item_id": null
  },
  "charge_items": [
    {
      "id": 904,
      "charge_id": 67,
      "parent_id": 902,
      "chargeable_item": {
        "id": 2,
        "created_at": "2023-08-23T13:18:36.000000Z",
        "updated_at": "2023-08-25T23:01:24.000000Z",
        "name": "Thick Poly Bags (3mm)",
        "type": "outbound_shipment_item",
        "unit": "bag",
        "when_to_charge": "attached",
        "charge": "0.2500",
        "advanced_options": null,
        "service_provider_id": 1,
        "price_records": [],
        "archived_at": "2023-08-25T23:01:24.000000Z"
      },
      "chargeable_item_id": "2",
      "chargeable_item_type": "company-service",
      "description": "Thick Poly Bags (3mm)",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0.25,
      "line_price_amount": 0.25
    },
    {
      "id": 901,
      "charge_id": 67,
      "parent_id": null,
      "chargeable_item": "...",
      "chargeable_item_id": "66",
      "chargeable_item_type": "outbound-shipment",
      "description": "Outbound Shipment, FBA ID: FBA0LUMFEZQ3W",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0,
      "line_price_amount": 0
    },
    {
      "id": 902,
      "charge_id": 67,
      "parent_id": 901,
      "chargeable_item": "...",
      "chargeable_item_id": "368",
      "chargeable_item_type": "outbound-shipment-item",
      "description": "Digital Bathroom Scale",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0,
      "line_price_amount": 0
    },
    {
      "id": 903,
      "charge_id": 67,
      "parent_id": 902,
      "chargeable_item": {
        "id": 5,
        "created_at": "2023-08-23T13:18:36.000000Z",
        "updated_at": "2023-08-23T13:18:36.000000Z",
        "name": "Base Per Outbound Shipment Item",
        "type": "outbound_shipment_item",
        "unit": "item",
        "when_to_charge": "always",
        "charge": "0.9900",
        "advanced_options": null,
        "service_provider_id": 1,
        "price_records": [],
        "archived_at": null
      },
      "chargeable_item_id": "5",
      "chargeable_item_type": "company-service",
      "description": "Base Per Outbound Shipment Item",
      "is_amendment": false,
      "units": 1,
      "unit_price_amount": 0.99,
      "line_price_amount": 0.99
    }
  ]
}

### Invoices
For any call on this page, you are required to set the merchant using the Merchant Header.

Index
View a list of invoices for a merchant using Pagination.

GET
/billing/invoices
Example Response
Store
Create a new invoice for a list of charges.

POST
/billing/invoices
Parameter	Type	Examples	Description
charge_ids
Optional
array<integer>	[22]	A list of IDs of the charges you would like to create an invoice for
Example Response
{
  "message": "Draft invoice created.",
  "invoice": {
    "id": 2,
    "charger_id": "1",
    "charger_type": "company",
    "chargee_id": "1",
    "chargee_type": "team",
    "created_at": "2023-08-09T16:39:26.558994Z",
    "currency": "USD",
    "status": "Draft",
    "stripe_invoice_status": null,
    "stripe_invoice_id": null,
    "description": null,
    "total": 293.8
  }
}

### Inventory
Making calls to the inventory API

Merchant Header Required
For any call on this page, you are required to set the merchant using the Merchant Header.

Index
Get a list of all inventory items. Returns up to 500 items in a single call, using Pagination.

GET
/inventory
Example Response

{
  "current_page": 1,
  "data": [
    {
      "id": 96,
      "created_at": "2022-04-01T09:34:55.000000Z",
      "updated_at": "2022-04-01T09:34:59.000000Z",
      "merchant_id": 2,
      "merchant_sku": "Synergist-163839",
      "title": "Synergistic Leather Shoes",
      "condition": "new",
      "condition_note": null,
      "length_mm": 91,
      "width_mm": 286,
      "height_mm": 174,
      "weight_gm": 1076,
      "actual_quantity": null,
      "item_id": null,
      "unsellable_quantity": null,
      "outbound_quantity": null,
      "order_quantity": null,
      "negative_moves_quantity": null,
      "positive_moves_quantity": null,
      "bundle_shipments_quantity": null,
      "root_item_id": null,
      "bundle_order_items_quantity": null,
      "quantity_in_stock": 0,
      "fnsku": "X008VSER78",
      "asin": "B014IA92I8",
      "searchableIdentifiers": "B014IA92I8,X008VSER78,3495184061393",
      "images": [
        {
          "id": 96,
          "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=96",
          "thumbnail_url": "data:image/png;base64,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"
        }
      ],
      "identifiers": [
        {
          "id": 191,
          "created_at": "2022-04-01T09:34:57.000000Z",
          "updated_at": "2022-04-01T09:34:57.000000Z",
          "identifier": "B014IA92I8",
          "identifier_type": "ASIN"
        },
        {
          "id": 192,
          "created_at": "2022-04-01T09:34:57.000000Z",
          "updated_at": "2022-04-01T09:34:57.000000Z",
          "identifier": "X008VSER78",
          "identifier_type": "FNSKU"
        },
        {
          "id": 296,
          "created_at": "2022-04-01T09:34:59.000000Z",
          "updated_at": "2022-04-01T09:34:59.000000Z",
          "identifier": "3495184061393",
          "identifier_type": "EAN"
        }
      ]
    }
  ],
  "first_page_url": "http://dashboard.domain.com/api/inventory?page=1",
  "from": 1,
  "last_page": 1,
  "last_page_url": "http://dashboard.domain.com/api/inventory?page=1",
  "links": [
    {
      "url": null,
      "label": "&laquo; Previous",
      "active": false
    },
    {
      "url": "http://dashboard.domain.com/api/inventory?page=1",
      "label": "1",
      "active": true
    },
    {
      "url": null,
      "label": "Next &raquo;",
      "active": false
    }
  ],
  "next_page_url": null,
  "path": "http://dashboard.domain.com/api/inventory",
  "per_page": 500,
  "prev_page_url": null,
  "to": 37,
  "total": 37
}
View
See the details for a specific inventory item.

GET
/inventory/{ITEM_ID}
Example Response
{
  "item": {
    "id": 50,
    "created_at": "2024-04-15T08:23:47.000000Z",
    "updated_at": "2024-04-15T08:23:47.000000Z",
    "merchant_id": 2,
    "merchant_sku": "Recycled-Pa-443089",
    "title": "Recycled Paper Notebooks",
    "condition": "new",
    "condition_note": null,
    "length_mm": 68,
    "width_mm": 140,
    "height_mm": 120,
    "weight_gm": 540,
    "quantity_in_stock": 0,
    "available_quantity": 0,
    "allocated_quantity": 0,
    "unavailable_quantity": 0,
    "inbound_quantity": 0,
    "fnsku": "X00HFKELAI",
    "asin": "B07B6AEUH9",
    "searchableIdentifiers": "4120401983452,B07B6AEUH9,X00HFKELAI",
    "history": [],
    "images": [
      {
        "id": 50,
        "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=50",
        "thumbnail_url": "data:image/png;base64,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"
      }
    ],
    "identifiers": [
      {
        "id": 152,
        "created_at": "2024-04-15T08:23:47.000000Z",
        "updated_at": "2024-04-15T08:23:47.000000Z",
        "identifier": "4120401983452",
        "identifier_type": "EAN"
      },
      {
        "id": 153,
        "created_at": "2024-04-15T08:23:47.000000Z",
        "updated_at": "2024-04-15T08:23:47.000000Z",
        "identifier": "B07B6AEUH9",
        "identifier_type": "ASIN"
      },
      {
        "id": 154,
        "created_at": "2024-04-15T08:23:47.000000Z",
        "updated_at": "2024-04-15T08:23:47.000000Z",
        "identifier": "X00HFKELAI",
        "identifier_type": "FNSKU"
      }
    ],
    "bundle": null,
    "containing_bundles": [],
    "item_group_configurations": [
      {
        "id": 50,
        "created_at": "2024-04-15T08:23:47.000000Z",
        "updated_at": "2024-04-15T08:23:47.000000Z",
        "quantity": 10,
        "type": "box",
        "weight_gm": 1450,
        "length_mm": 2780,
        "width_mm": 3380,
        "height_mm": 3030,
        "default": false
      }
    ],
    "listings": [
      {
        "id": 50,
        "created_at": "2024-04-15T08:23:47.000000Z",
        "updated_at": "2024-04-15T08:23:47.000000Z",
        "channel_id": 2,
        "channel_identifier": "Recycled-Pa-443089",
        "item_id": 50,
        "status": "synced",
        "channel_data": [],
        "channel": {
          "id": 2,
          "created_at": "2024-04-15T08:23:47.000000Z",
          "updated_at": "2024-04-15T08:23:47.000000Z",
          "merchant_id": 2,
          "type": "amazon",
          "nickname": "Amazon Store",
          "channel_account_id": "23o-othvv-xkrxh-rlrw",
          "connection_status": "active"
        }
      },
      {
        "id": 151,
        "created_at": "2024-04-16T07:06:08.000000Z",
        "updated_at": "2024-04-16T07:06:08.000000Z",
        "channel_id": 2,
        "channel_identifier": "Recycled-Pa-4430892",
        "item_id": 50,
        "status": "checking",
        "channel_data": [],
        "channel": {
          "id": 2,
          "created_at": "2024-04-15T08:23:47.000000Z",
          "updated_at": "2024-04-15T08:23:47.000000Z",
          "merchant_id": 2,
          "type": "amazon",
          "nickname": "Amazon Store",
          "channel_account_id": "23o-othvv-xkrxh-rlrw",
          "connection_status": "active"
        }
      }
    ],
    "company_services": []
  }
}

Search
The inventory search API allows you to search for items with a single parameter that filters by title, SKU, and any identifiers that are attached to the item (such as FNSKU, ASIN, or EAN). 10 items or less matching the title or SKU plus any items with matching identifiers are returned in a single calls.

POST
/inventory/search
Parameter	Type	Examples	Description
{
  "items": [
    {
      "id": 9,
      "created_at": "2021-02-19T14:11:38.000000Z",
      "updated_at": "2021-02-19T14:11:38.000000Z",
      "merchant_id": 2,
      "merchant_sku": "Heavy-Duty-979091",
      "title": "Heavy Duty Wool Keyboard",
      "condition": null,
      "condition_note": null,
      "length_mm": 589,
      "width_mm": 212,
      "height_mm": 509,
      "weight_gm": 3602,
      "fnsku": "X00U2E5ZYE",
      "asin": "B07611F2KY",
      "images": [
        {
          "id": 9,
          "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=9",
          "thumbnail_url": "https://source.unsplash.com/collection/345710/100x100?sig=9"
        }
      ],
      "identifiers": [
        {
          "id": 17,
          "created_at": "2021-02-19T14:11:39.000000Z",
          "updated_at": "2021-02-19T14:11:39.000000Z",
          "identifier": "B07611F2KY",
          "identifier_type": "ASIN"
        },
        {
          "id": 18,
          "created_at": "2021-02-19T14:11:39.000000Z",
          "updated_at": "2021-02-19T14:11:39.000000Z",
          "identifier": "X00U2E5ZYE",
          "identifier_type": "FNSKU"
        },
        {
          "id": 109,
          "created_at": "2021-02-19T14:11:40.000000Z",
          "updated_at": "2021-02-19T14:11:40.000000Z",
          "identifier": "0386608654624",
          "identifier_type": "EAN"
        }
      ],
      "company_services": []
    }
  ]
}

q
Optional
string	X00CGJI1G66	Search query
Example Response
Create
The inventory create API allows to create a new item within a merchant's inventory.

POST
/inventory
Parameter	Type	Examples	Description
{
  "data": {
    "id": 2362,
    "created_at": "2025-03-12T09:42:40Z",
    "updated_at": "2025-03-12T09:42:40Z",
    "merchant_sku": "0D-O2GN-CNH9",
    "title": "Test",
    "condition": null,
    "condition_note": null
  }
}
merchant_sku
Required
string	ABC-123	(required) The SKU for the item. Min 3 characters, max 255 characters. The SKU must be unique for the merchant.
title
Required
string	Brilliant Gemstone	(required) The title for the item. Min 3 characters, max 255 characters.
condition
Optional
string	new	The condition of the item. The list of possible conditions are the same as Amazon's values.
condition_note
Optional
string	new	Notes on the condition of the item
asin
Optional
string	B00X4WHP5E	The Amazon ASIN for the item.
Example Response
Update
The inventory update API allows you to update an existing item.

PUT
/inventory/{ITEM_ID}
Parameter	Type	Examples	Description
{
  "message": "Item updated",
  "item_details": {
    "id": 151,
    "created_at": "2024-04-03T11:19:35.000000Z",
    "updated_at": "2024-04-03T11:19:35.000000Z",
    "merchant_id": 2,
    "merchant_sku": "3J-NO51-ICT7",
    "title": "Test Title",
    "condition": "new",
    "condition_note": null,
    "length_mm": 140,
    "width_mm": 140,
    "height_mm": 140,
    "weight_gm": 240,
    "fnsku": "",
    "asin": "",
    "searchableIdentifiers": "",
    "images": [],
    "identifiers": []
  }
}
length_mm
Required
integer	140	(required) The length of the item in millimeters. Min 1, max 500000.
width_mm
Required
integer	140	(required) The width of the item in millimeters. Min 1, max 500000.
height_mm
Required
integer	140	(required) The height of the item in millimeters. Min 1, max 500000.
weight_gm
Required
integer	240	(required) The weight of the item in grams. Min 1, max 500000.
Example Response
Add Identifier
The add identifier endpoint allows you to add an identifier to an existing item.

POST
/inventory/{ITEM_ID}/identifier
Parameter	Type	Examples	Description
{
  "message": "Item identifier added",
  "identifier": "1234567890"
}
identifier
Required
string	123456789012	(required) The identifier for the item. The value should be the UPC, EAN, FNSKU, ASIN, or CUSTOM identifier for the item. The validation for each identifier is as follows: UPC: 12 digits, EAN: 13 digits, FNSKU: 10 characters, ASIN: 10 characters, CUSTOM: 1-255 characters.
identifier_type
Required
string	UPC	(required) The type of identifier for the item. The list of possible values are: UPC, EAN, FNSKU, ASIN, CUSTOM.
Example Response
Add Service
The add services endpoint allows you to add services to an existing item.

POST
/inventory/services
Parameter	Type	Examples	Description
{
  "message": "Services Updated"
}
item_id
Required
int	14	(required) The primary key for the item you want to add services to.
services
Required
array	See services.* for ids example	(required) An array of ids associated with the services you would like to add to the item.
services.*
Required
int	1	(required) The ID for the service you would like to add to the item.
Example Response
{
  "message": "Services Updated"
}

### Inbound Shipments
Items

Outbound Shipments
Items
FBA Plans
Orders
Services
Warehouses

Webhooks
Types
Service Provider API
Adjustments
Merchants
User Invitations
Inbound Shipment Items
Index
Get a list of the items on an inbound shipment.

GET
/shipments/inbound/{SHIPMENT_ID}/items
Example Response
{
  "items": [
    {
      "id": 1,
      "item_id": 1,
      "shipment_id": 629,
      "expected": {
        "quantity": 10,
        "item_group_configurations": [],
        "id": 1072
      },
      "actual": {
        "quantity": 10,
        "item_group_configurations": [],
        "moves": [],
        "id": 830
      },
      "unsellable": {
        "quantity": 0
      },
      "item": {
        "id": 1,
        "created_at": "2024-03-01T11:25:57.000000Z",
        "updated_at": "2024-03-01T11:25:57.000000Z",
        "merchant_id": 1,
        "merchant_sku": "Silicone-223984",
        "title": "1 - Silicone Baking Mats",
        "condition": "new",
        "condition_note": null,
        "length_mm": 127,
        "width_mm": 50,
        "height_mm": 81,
        "weight_gm": 1570,
        "fnsku": "X00RKD6OEZ",
        "asin": "B03Z7PEHQ4",
        "searchableIdentifiers": "8743265185191,B03Z7PEHQ4,X00RKD6OEZ",
        "images": [
          {
            "id": 1,
            "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=1",
            "thumbnail_url": "data:image/png;base64,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"
          }
        ],
        "identifiers": [
          {
            "id": 1,
            "created_at": "2024-03-01T11:25:57.000000Z",
            "updated_at": "2024-03-01T11:25:57.000000Z",
            "identifier": "8743265185191",
            "identifier_type": "EAN"
          },
          {
            "id": 2,
            "created_at": "2024-03-01T11:25:57.000000Z",
            "updated_at": "2024-03-01T11:25:57.000000Z",
            "identifier": "B03Z7PEHQ4",
            "identifier_type": "ASIN"
          },
          {
            "id": 3,
            "created_at": "2024-03-01T11:25:57.000000Z",
            "updated_at": "2024-03-01T11:25:57.000000Z",
            "identifier": "X00RKD6OEZ",
            "identifier_type": "FNSKU"
          }
        ],
        "company_services": [],
        "listings": [
          {
            "id": 1,
            "created_at": "2024-03-01T11:25:57.000000Z",
            "updated_at": "2024-03-01T11:25:57.000000Z",
            "channel_id": 1,
            "channel_identifier": "Silicone-223984",
            "item_id": 1,
            "status": "synced",
            "channel_data": []
          }
        ],
        "bundle": null,
        "item_group_configurations": [
          {
            "id": 1,
            "created_at": "2024-03-01T11:25:57.000000Z",
            "updated_at": "2024-03-01T11:25:57.000000Z",
            "quantity": 6,
            "type": "box",
            "weight_gm": 500,
            "length_mm": 1720,
            "width_mm": 2560,
            "height_mm": 2880,
            "default": false
          }
        ]
      }
    }
  ]
}
Add
Add a new item to an inbound shipment.

POST
/shipments/inbound/{SHIPMENT_ID}/add-item
Parameter	Type	Examples	Description
item_id
Required
integer	12	(required) The ID of the item that you are sending in the shipment.
quantity
Required
integer	50	(required) The quantity of the item that you are sending in the shipment.
Example Response
{
  "message": "Item added to shipment"
}
Update
Modify an item on an inbound shipment.

POST
/shipments/inbound/{SHIPMENT_ID}/update-item
Parameter	Type	Examples	Description
item_id
Required
integer	12	(required) The ID of the item that you are updating
expected
Required
array<ExpectedItem>	[...]	(required) An array of expected items that you are receiving in the shipment.
expected.quantity
Required
integer	50	(required) The quantity of the item that you are receiving in the shipment.
expected.item_group_configurations
Required
array<ItemGroupConfiguration>	[...]	(required) An array of item group configurations that you are receiving in the shipment. If you pass the item group configurations, the passed item quantity will be ignored and the quantity will be calculated based on the item group configurations.
expected.item_group_configurations.*.configuration_id
Required
integer	12	(required) The configuration ID for the item group configuration.
expected.item_group_configurations.*.quantity
Required
integer	5	(required) The number of item groups that you are receiving in the shipment.
expected.item_group_configurations.*.partial_quantity
Required
integer	1	(required) The extra items not included in a full item group.
actual
Required
array<ActualItem>	[...]	(required) An array of actual items that you are receiving in the shipment.
actual.quantity
Required
integer	50	(required) The quantity of the item that you have received in the shipment.
actual.item_group_configurations
Required
array<ItemGroupConfiguration>	[...]	(required) An array of item group configurations that you have received in the shipment.
actual.item_group_configurations.*.configuration_id
Required
integer	12	(required) The configuration ID for the item group configuration.
actual.item_group_configurations.*.quantity
Required
integer	5	(required) The number of item groups that you have received in the shipment.
actual.item_group_configurations.*.partial_quantity
Required
integer	1	(required) The extra items not included in a full item group.
Example Response
{
  "message": "Item updated"
}
Remove
Remove an item from an inbound shipment.

POST
/shipments/inbound/{SHIPMENT_ID}/remove-item
Parameter	Type	Examples	Description
item_id
Required
integer	12	(required) The ID of the item that you are updating
Example Response
{
  "message": "Item removed from shipment"
}
© 2026 PrepBusiness. All rights reserved.

### Outbound Shipments
Making calls to the outbound shipments API

Index
Get a list of all outbound shipments, using Pagination.

GET
/shipments/outbound
Example Response
{
  "current_page": 1,
  "data": [
    {
      "id": 5657,
      "created_at": "2024-07-24T11:09:48.000000Z",
      "updated_at": "2024-07-24T11:13:07.000000Z",
      "merchant_id": 1,
      "status": "open",
      "notes": null,
      "name": "Test Plans",
      "warehouse_id": 1,
      "shipped_at": null,
      "internal_notes": null,
      "ship_from_address_id": 1,
      "archived_at": null,
      "currency": "USD",
      "is_case_forwarding": false,
      "sku_count": 1,
      "shipped_items_count": 5,
      "searchable_identifiers": "B00LIRROR6,X00N2VJGHH,Incredibl-746543,Incredible Granite Chair,FBANT8XDAU9CX",
      "searchable_tags": [],
      "tags": [],
      "fba_transport_plans": [
        {
          "outbound_shipment_id": 5657,
          "fba_shipment_id": "FBANT8XDAU9CX",
          "fba_shipment_name": "Test Plans - Split 1",
          "fba_transport_v0_plan_id": "6d174247-330a-4a55-aaa6-903e3c404026",
          "transport_status": "estimated"
        }
      ]
    }
  ],
  "first_page_url": "http://demo.prepbusiness.com/api/shipments/outbound?page=1",
  "from": 1,
  "last_page": 2,
  "last_page_url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
  "links": [
    {
      "url": null,
      "label": "&laquo; Previous",
      "active": false
    },
    {
      "url": "http://demo.prepbusiness.com/api/shipments/outbound?page=1",
      "label": "1",
      "active": true
    },
    {
      "url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
      "label": "2",
      "active": false
    },
    {
      "url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
      "label": "Next &raquo;",
      "active": false
    }
  ],
  "next_page_url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
  "path": "http://demo.prepbusiness.com/api/shipments/outbound",
  "per_page": 20,
  "prev_page_url": null,
  "to": 20,
  "total": 22
}
Index (Archived Shipments)
Get a list of all archived outbound shipments, using Pagination.

GET
/shipments/outbound/archived
Example Response
{
  "current_page": 1,
  "data": [
    {
      "id": 5657,
      "created_at": "2024-07-24T11:09:48.000000Z",
      "updated_at": "2024-07-24T11:13:07.000000Z",
      "merchant_id": 1,
      "status": "open",
      "notes": null,
      "name": "Test Plans",
      "warehouse_id": 1,
      "shipped_at": null,
      "internal_notes": null,
      "ship_from_address_id": 1,
      "archived_at": null,
      "currency": "USD",
      "is_case_forwarding": false,
      "sku_count": 1,
      "shipped_items_count": 5,
      "searchable_identifiers": "B00LIRROR6,X00N2VJGHH,Incredibl-746543,Incredible Granite Chair,FBANT8XDAU9CX",
      "searchable_tags": [],
      "tags": [],
      "fba_transport_plans": [
        {
          "outbound_shipment_id": 5657,
          "fba_shipment_id": "FBANT8XDAU9CX",
          "fba_shipment_name": "Test Plans - Split 1",
          "fba_transport_v0_plan_id": "6d174247-330a-4a55-aaa6-903e3c404026",
          "transport_status": "estimated"
        }
      ]
    }
  ],
  "first_page_url": "http://demo.prepbusiness.com/api/shipments/outbound?page=1",
  "from": 1,
  "last_page": 2,
  "last_page_url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
  "links": [
    {
      "url": null,
      "label": "&laquo; Previous",
      "active": false
    },
    {
      "url": "http://demo.prepbusiness.com/api/shipments/outbound?page=1",
      "label": "1",
      "active": true
    },
    {
      "url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
      "label": "2",
      "active": false
    },
    {
      "url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
      "label": "Next &raquo;",
      "active": false
    }
  ],
  "next_page_url": "http://demo.prepbusiness.com/api/shipments/outbound?page=2",
  "path": "http://demo.prepbusiness.com/api/shipments/outbound",
  "per_page": 20,
  "prev_page_url": null,
  "to": 20,
  "total": 22
}
Show
Retrieve a specific shipment

GET
/shipments/outbound/{SHIPMENT_ID}
Example Response
{
  "shipment": {
    "id": 6,
    "created_at": "2024-07-23T06:51:11.000000Z",
    "updated_at": "2024-06-04T12:45:12.000000Z",
    "merchant_id": 1,
    "status": "closed",
    "notes": null,
    "name": "Triton Tech",
    "warehouse_id": 1,
    "shipped_at": "2024-07-23T06:51:11.000000Z",
    "internal_notes": null,
    "errors": null,
    "ship_from_address_id": null,
    "archived_at": null,
    "currency": "USD",
    "is_case_forwarding": false,
    "is_case_packed": true,
    "outbound_items": [
      {
        "id": 14,
        "created_at": "2024-06-04T06:51:14.000000Z",
        "updated_at": "2024-06-04T06:51:14.000000Z",
        "shipment_id": 6,
        "item_id": 21,
        "quantity": 20,
        "case_quantity": null,
        "expiry_date": null,
        "item": {
          "id": 21,
          "created_at": "2024-06-04T06:51:10.000000Z",
          "updated_at": "2024-06-04T06:51:10.000000Z",
          "merchant_id": 1,
          "merchant_sku": "Crystal-W-283235",
          "title": "Crystal Wine Decanter",
          "condition": "new",
          "condition_note": null,
          "length_mm": 261,
          "width_mm": 86,
          "height_mm": 132,
          "weight_gm": 709,
          "fnsku": "X007V73BAF",
          "asin": "B04Z6GUVL5",
          "searchableIdentifiers": "6190392150205,B04Z6GUVL5,X007V73BAF",
          "images": [
            {
              "id": 21,
              "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=21",
              "thumbnail_url": "data:image/png;base64,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"
            }
          ],
          "identifiers": [
            {
              "id": 61,
              "created_at": "2024-06-04T06:51:10.000000Z",
              "updated_at": "2024-06-04T06:51:10.000000Z",
              "identifier": "6190392150205",
              "identifier_type": "EAN"
            },
            {
              "id": 62,
              "created_at": "2024-06-04T06:51:10.000000Z",
              "updated_at": "2024-06-04T06:51:10.000000Z",
              "identifier": "B04Z6GUVL5",
              "identifier_type": "ASIN"
            },
            {
              "id": 63,
              "created_at": "2024-06-04T06:51:10.000000Z",
              "updated_at": "2024-06-04T06:51:10.000000Z",
              "identifier": "X007V73BAF",
              "identifier_type": "FNSKU"
            }
          ]
        }
      }
    ],
    "service_lines": [],
    "attachments": [],
    "tags": []
  }
}
Create
Create a new outbound shipment

POST
/shipments/outbound
Parameter	Type	Examples	Description
notes
Optional
string	Inventore iusto facilis aperiam modi est.	Shipment notes
name
Required
string	Walmart Oct 26	The name of the shipment
warehouse_id
Required
integer	12	The ID of the warehouse that you are sending the shipment from.
Example Response
{
  "message": "Shipment Created",
  "shipment_id": "22"
}
Attachments
Attach a document to an Outbound Shipment

The Content-Type header must be set to multipart/form-data

POST
/shipments/outbound/{OUTBOUND_SHIPMENT_ID}/attachment
Parameter	Type	Examples	Description
file
Required
binary	Manifest.xml	The contents of the file
name
Required
string	Manifest	The name of the file
Example Response
{
  "message": "Attachments have been uploaded to this shipment.",
  "attachments": [
    {
      "path": "attachments/EZDXv1TmvIOkBKjysyDSiM8keDjs16yP5dYp661c1D6MUSCqSyib0LEydAzWirell2ZauIlBo3AG877UUYGZpcOiKp4cUW7wz9tzvFW13swQLPebryR4Lyxe.png",
      "name": "Manifest.xml",
      "url": "http://localhost:3001/storage/attachments/EZDXv1TmvIOkBKjysyDSiM8keDjs16yP5dYp661c1D6MUSCqSyib0LEydAzWirell2ZauIlBo3AG877UUYGZpcOiKp4cUW7wz9tzvFW13swQLPebryR4Lyxe.png",
      "attachable_id": 15,
      "attachable_type": "outbound-shipment",
      "updated_at": "2024-05-29T12:39:06.000000Z",
      "created_at": "2024-05-29T12:39:06.000000Z",
      "id": 1
    }
  ]
}



### Outbound Shipment Items
Index
Get a list of the items on an outbound shipment.

GET
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item
Example Response
{
  "items": [
    {
      "id": 1387,
      "created_at": "2024-04-08T10:30:57.000000Z",
      "updated_at": "2024-04-08T10:30:57.000000Z",
      "shipment_id": 1455,
      "item_id": 3375,
      "quantity": 80,
      "case_quantity": null,
      "expiry_date": null,
      "cost_per_item": 17.93,
      "item": {
        "id": 3375,
        "created_at": "2024-04-08T10:30:57.000000Z",
        "updated_at": "2024-04-08T10:30:57.000000Z",
        "merchant_id": 1,
        "merchant_sku": "Mediocre-Ir-932762",
        "title": "Mediocre Iron Shoes",
        "condition": "new",
        "condition_note": null,
        "length_mm": 165,
        "width_mm": 125,
        "height_mm": 115,
        "weight_gm": 1098,
        "quantity_in_stock": 0,
        "available_quantity": -80,
        "allocated_quantity": 80,
        "unavailable_quantity": 0,
        "inbound_quantity": 0,
        "fnsku": "X0008OG4VD",
        "asin": "B01MRL790Q",
        "searchableIdentifiers": "B01MRL790Q,X0008OG4VD",
        "images": [
          {
            "id": 3367,
            "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=3375",
            "thumbnail_url": "data:image/png;base64,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"
          }
        ],
        "identifiers": [
          {
            "id": 6947,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z",
            "identifier": "B01MRL790Q",
            "identifier_type": "ASIN"
          },
          {
            "id": 6948,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z",
            "identifier": "X0008OG4VD",
            "identifier_type": "FNSKU"
          }
        ],
        "bundle": null,
        "listings": [],
        "item_group_configurations": [
          {
            "id": 3722,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z",
            "quantity": 10,
            "type": "box",
            "weight_gm": 1270,
            "length_mm": 170,
            "width_mm": 130,
            "height_mm": 450,
            "default": false
          }
        ],
        "tags": []
      },
      "bundle": null,
      "item_group_configurations": [],
      "moves": [],
      "company_services": [
        {
          "id": 474,
          "created_at": "2024-04-08T10:30:57.000000Z",
          "updated_at": "2024-04-08T10:30:57.000000Z",
          "name": "Dietetic Technician SR2315",
          "type": "outbound_shipment",
          "unit": "box",
          "when_to_charge": "attached",
          "charge": "14.5600",
          "advanced_options": [],
          "service_provider_id": 10,
          "price_records": [],
          "archived_at": null,
          "pivot": {
            "outbound_shipment_item_id": 1387,
            "company_service_id": 474,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z"
          }
        },
        {
          "id": 475,
          "created_at": "2024-04-08T10:30:57.000000Z",
          "updated_at": "2024-04-08T10:30:57.000000Z",
          "name": "Electromechanical Equipment Assembler SR4789",
          "type": "outbound_shipment",
          "unit": "bag",
          "when_to_charge": "attached",
          "charge": "2.3800",
          "advanced_options": [],
          "service_provider_id": 10,
          "price_records": [],
          "archived_at": null,
          "pivot": {
            "outbound_shipment_item_id": 1387,
            "company_service_id": 475,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z"
          }
        }
      ]
    }
  ]
}
Create
Add a new item to an outbound shipment.

POST
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item
Parameter	Type	Examples	Description
item_id
Required
integer	12	(required) The ID of the item that you are sending in the shipment.
quantity
Required
integer	50	(required) The quantity of the item that you are sending in the shipment.
expiry_date
Optional
date	2025-12-31	The expiry date of the item that you are sending in the shipment.
Example Response
Update
Modify an item on an outbound shipment.

PATCH
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item/{OUTBOUND_SHIPMENT_ITEM_ID}
Parameter	Type	Examples	Description
quantity
Required
integer	50	(required) The quantity of the item that you are sending in the shipment.
expiry_date
Optional
date	2025-12-31	The expiry date of the item that you are sending in the shipment.
item_group_configurations
Required
array<ItemGroupConfiguration>	[...]	(required) An array of item group configurations that you are sending in the shipment.
item_group_configurations.*.configuration_id
Required
integer	12	(required) The configuration ID for the item group configuration.
item_group_configurations.*.quantity
Required
integer	5	(required) The number of item groups that you are sending in the shipment.
item_group_configurations.*.partial_quantity
Required
integer	1	(required) The extra items not included in a full item group.
Example Response
{
  "message": "Item updated"
}
Delete
Remove an item from an outbound shipment.

DELETE
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item/{OUTBOUND_SHIPMENT_ITEM_ID}
Example Response
{
  "message": "Item deleted"
}
© 2026 PrepBusiness. All rights reserved.

Index
Get a list of the items on an outbound shipment.

GET
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item
Example Response
{
  "items": [
    {
      "id": 1387,
      "created_at": "2024-04-08T10:30:57.000000Z",
      "updated_at": "2024-04-08T10:30:57.000000Z",
      "shipment_id": 1455,
      "item_id": 3375,
      "quantity": 80,
      "case_quantity": null,
      "expiry_date": null,
      "cost_per_item": 17.93,
      "item": {
        "id": 3375,
        "created_at": "2024-04-08T10:30:57.000000Z",
        "updated_at": "2024-04-08T10:30:57.000000Z",
        "merchant_id": 1,
        "merchant_sku": "Mediocre-Ir-932762",
        "title": "Mediocre Iron Shoes",
        "condition": "new",
        "condition_note": null,
        "length_mm": 165,
        "width_mm": 125,
        "height_mm": 115,
        "weight_gm": 1098,
        "quantity_in_stock": 0,
        "available_quantity": -80,
        "allocated_quantity": 80,
        "unavailable_quantity": 0,
        "inbound_quantity": 0,
        "fnsku": "X0008OG4VD",
        "asin": "B01MRL790Q",
        "searchableIdentifiers": "B01MRL790Q,X0008OG4VD",
        "images": [
          {
            "id": 3367,
            "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=3375",
            "thumbnail_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAjVBMVEX///8jHyAAAAAWEBJ7eXkTDA4QCAvp6OiLiYogHB0cFxgdGBkeGhsYExQJAADx8fHAv78MAAX5+fmTkZK/vr7Hxsb09PRIRUbNzMxBPj9samva2dm4t7eYlpdPTE12dHXU1NRbWVlkYmIsKCmdnJw3NDXi4uKvrq4zMDGGhIVNSkqnpqZfXV1VU1NFQkOurYy8AAAJQUlEQVR4nO2da3uqOhCFJVRaBKF4r5ZqrbX3/f9/3ol6rBdmYTKCYJ9ZX7ey83bW5EYyNhoikUgkEolEIpFIJBKJRCKRSCQSiUSEOrPRrFN1I8rU4l0p9b6ouhllabBIIt9xHD+JFoOqG1OCBgtnzbeSH/npX2PsLN5/+TaML38rjgs/2edbMyZB+lf6nMGiHR3zbeLYXMRVN64ADb5eSL4No3P1jJ0U8/2fj1ft1c7Cy+RfhtFLrrZfHSzC3Pjt+px2eo1eHSxof7bpfLw+xtSh+HxPTZVH/UPid6tuso0Gi4jKP98L7+LGoJsdHDfwVxPH/fnZYZjuNghxF3wguApGkH++F3Vvfz8UpwnpVT121L1f7aQubcHm3WHTO12XZPSa3TozxgsX+LObtd8AdEaJR3y4Horp/HOS1p4/D76Q6mGCYgxrmY9gfqa7yJyQxCkYO5zaeTVOwfgQ3OU3tQPHjlp5ddCFw/jpZsYoH93aMA7Sl4RIJ0d3i3T+HStO22QctVfrwNhJkc3uzJuHTOAFleej7ipoPt+yaYOuU8d8jNOAXP/5r4xmgbmc41WXjwPQJMcJhzPOA3WHjMaOKhgH9NTyf0T1M+M8tNNt0/kYXTwf47SZvz/RUs8jzoPRXM5LLhpHPYSd3H9x2uqbxRinITX4rPrVSzF26G6PYIx+mIxg7PBPTJCKEfrv3RbB2FJPLEbwR7zE2BF326SFEufjR9GM3DiCscOzmEgw/lv0p/VW87P7TxUSbWqr5z7rP0vBGtkvjXGAluXRNj3uH8g4ttUnr1/tevR/6JaSj3HXZDjuPwGv8vIRTCpWk16zSb254m6L7D+T8Dj171E+cr0K8tF04WImu2lx/5P2avTEZIRjR1H5iPzptVA6QK8OmWNHQDfAZoGGFXebjPV7n/ZqoHhxxHO5s/Nx+eGT82u4f/ar/jMaH5lebdFzudbHkvO8rZA/lclUfzREXuXFEewDNKMz3ul0FRgfDF/bjn4U9TItUA8sRjSXU2zEJfE8s/2zX42eASOzXyXHRz/hGjXNOt9LbLejRygfn+45bVrN5TIPS1LOo7TGmT+/zzlWALzaUv94Xk0zj2qPOQ9qkIQfrM559A28OmTE8fajOMKpm3lWM7pheX40R/loybj88JqZx7hTTpu0brKEmtGdsuI4o/ucllUcb2+aTaI3dW84LWoAQr2aV1NWHGfIqw+GjMupovgKJ1w9kcs4jyjGUA17p7+8vFGwPYUTaq960wnnkTOUj5+P+V+cTIn8K5NQPzUas+I4QfmY59XlNMF8ZRGuNifGrDhO5hH14FC9Aq8ux9CfxRHSK3wu44xuckDm42RKfthPdlOlAgjdjzf6FKybMOM4RnOAx+MPkvnnR97bx6555xM27xqdr5eI3iycM70K4rjvVeDP1cnbTuPuF70YQq2vd7AhymQcJzTjQ2/7ATLQfvTytZoel0Co4/hOrRhX+ThjMU5JhHDtVZCsvnr52iy/yyBcMQY0Y/TNiuOSDpOey8092p/u13Z5Uw5hI8erzzMeI+1ValEZan/uvlkaoY7jK/DqnMU4mZKM2fip16/95Wl5hJrx7QUxsjZEwZB3xOe8HS6/yyTU0oyFevUEYxg5X8ffKZlQM76qgGgL9wX+cupRj9vwqfe37DdKJ9SMD6RXW8wX+Msh5Yp1/r1R20MXIGw0HoFXOS/wZ98gfsf5t9VFCDXjK8lo/cJwhjaPKX9udCHCtVdpRos4gk1VvaCCfBckbHQeUT4avoTp04tilH9bXY6wAfPRyKtgwziMVGZ8ONRFCTXjAxg7Tmxsj+gXxkGuPze6MKFmHJKMQZ5XwUvGUP07yVcBYaPRQ3EEG9t94E/1fmLjbaMKCHMY/2UZwYEG3X8a8VVEqBn/gbw62izs0y+I9ecM+Soj1Iz04a9APe02YMChG51/xnwVEq4Pf+V6FfvTYHN/pwoJNSPyqmYAh99avxtQpqqUUHuVPjQUKh/MDT4t+SonXB+MorxKze94L4MrJ9SMtFezfKYvEA9VA0J4wG1f3ANENSGE48KO78k6/7aqCWFuHAN2/FaqDaFeP8DDmGfw1YpwNcfOvMBvMQ9+7VQrwvWhof045q6pDFUzwtVafofY+jybr4aEjXh35M4r4vRy/Qhv9wiLOGcvhAYSQksJoa2E0EBCaCkhtJUQGkgILSWEthJCAwmhpYTQVkJoICG0lBDaSggNJISWEkJbCaGBhNBSQmgrITSQEFqq1oQO8+L2gYolXI53tcALucvdVrwL+HsqkvDwLlhBt9Xd5Mw4Fke4PCo/UNh9fFedxVgUYfb6M5swW2PoLK8WQ7gk7g4n3N+qmxB1/d2IdwG/UQzhZEzVY4jYf/apyj6NXRCjAEJwZ1hxC/BozUG1zjmH8VxCcO87UHPGw371OASXYRn5eB4huLsfWB3vJwUuiTDy8RzC5Zi8nm9+/SRXPfrCbzuyLBbBJ1yS/Yvx9SEDPdIHti0LYnAJYf6ZX68x0COqgmxREINHCO7q212vMVKPvgzrmnuVQ0iPf6urKUXzrQQrPRsy2hMa1bApVNqrZJ9j5lVbwtzaLqWpR18UdU0Y7QiBP8Ni+xdK/LHDhhCMD0Fx40OeYD6eKMJjTrik69bZX29jq0df2jqRj6aEM3r8C0/W5StU93Q+aq/O4HfMCEG9uuBy8duqb+1VE8IJqqt4cb6VeqC6PCqmdJoQlC9rlTs+5Oke5SPJeIoQ5F/AuF5aoMClZnKek08Ix7/S5i+mAhdFiYJReYQg//Jrfl5M4BJlxquYEPqTf/2yYPXRfPV7tvcpRDhD4wNRaqI6Qa/uMdKEE7q2MPf6c4lCv0yyy0eKcELXhyZLhVQvnI+bQkNZwvrn37H6YC638eoxIfBnWM/4bQWKsqy9ekgI/Vm7/DsW9mpvF9/WPZqf1daf++r/0F7df5OVFPM7ApUJ5GO+uL/NUpFGw8ik6MdO55YfqEDgF58Q38+1+HNfBoVNtv4s4np+JQK/+HQcv6vKv2MRBTGO+a6m/0QChQO3/jy/PEYNBIq3nFueplbSjFmvXuH4kKeMV690fMjTaH985P7uWs012u51hMzfI7sCjR6U226qB1a57ytR/2Z881fjJxKJRCKRSCQSiUQikUgkEolEIpHoTP0HQMK6qG8e9HsAAAAASUVORK5CYII="
          }
        ],
        "identifiers": [
          {
            "id": 6947,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z",
            "identifier": "B01MRL790Q",
            "identifier_type": "ASIN"
          },
          {
            "id": 6948,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z",
            "identifier": "X0008OG4VD",
            "identifier_type": "FNSKU"
          }
        ],
        "bundle": null,
        "listings": [],
        "item_group_configurations": [
          {
            "id": 3722,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z",
            "quantity": 10,
            "type": "box",
            "weight_gm": 1270,
            "length_mm": 170,
            "width_mm": 130,
            "height_mm": 450,
            "default": false
          }
        ],
        "tags": []
      },
      "bundle": null,
      "item_group_configurations": [],
      "moves": [],
      "company_services": [
        {
          "id": 474,
          "created_at": "2024-04-08T10:30:57.000000Z",
          "updated_at": "2024-04-08T10:30:57.000000Z",
          "name": "Dietetic Technician SR2315",
          "type": "outbound_shipment",
          "unit": "box",
          "when_to_charge": "attached",
          "charge": "14.5600",
          "advanced_options": [],
          "service_provider_id": 10,
          "price_records": [],
          "archived_at": null,
          "pivot": {
            "outbound_shipment_item_id": 1387,
            "company_service_id": 474,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z"
          }
        },
        {
          "id": 475,
          "created_at": "2024-04-08T10:30:57.000000Z",
          "updated_at": "2024-04-08T10:30:57.000000Z",
          "name": "Electromechanical Equipment Assembler SR4789",
          "type": "outbound_shipment",
          "unit": "bag",
          "when_to_charge": "attached",
          "charge": "2.3800",
          "advanced_options": [],
          "service_provider_id": 10,
          "price_records": [],
          "archived_at": null,
          "pivot": {
            "outbound_shipment_item_id": 1387,
            "company_service_id": 475,
            "created_at": "2024-04-08T10:30:57.000000Z",
            "updated_at": "2024-04-08T10:30:57.000000Z"
          }
        }
      ]
    }
  ]
}
Create
Add a new item to an outbound shipment.

POST
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item
Parameter	Type	Examples	Description
item_id
Required
integer	12	(required) The ID of the item that you are sending in the shipment.
quantity
Required
integer	50	(required) The quantity of the item that you are sending in the shipment.
expiry_date
Optional
date	2025-12-31	The expiry date of the item that you are sending in the shipment.
Example Response
{
  "message": "Item added to shipment"
}
Update
Modify an item on an outbound shipment.

PATCH
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item/{OUTBOUND_SHIPMENT_ITEM_ID}
Parameter	Type	Examples	Description
quantity
Required
integer	50	(required) The quantity of the item that you are sending in the shipment.
expiry_date
Optional
date	2025-12-31	The expiry date of the item that you are sending in the shipment.
item_group_configurations
Required
array<ItemGroupConfiguration>	[...]	(required) An array of item group configurations that you are sending in the shipment.
item_group_configurations.*.configuration_id
Required
integer	12	(required) The configuration ID for the item group configuration.
item_group_configurations.*.quantity
Required
integer	5	(required) The number of item groups that you are sending in the shipment.
item_group_configurations.*.partial_quantity
Required
integer	1	(required) The extra items not included in a full item group.
Example Response
{
  "message": "Item updated"
}
Delete
Remove an item from an outbound shipment.

DELETE
/shipments/outbound/{SHIPMENT_ID}/outbound-shipment-item/{OUTBOUND_SHIPMENT_ITEM_ID}
Example Response
{
  "message": "Item deleted"
}
© 2026 PrepBusiness. All rights reserved.
### FBA Plans
Index
Get a list of all FBA plans for a given shipment. The outbound_shipment_id parameter is required.

GET
/fba-transport/v2024/plans
Parameter	Type	Examples	Description
outbound_shipment_id
Required
integer	12345	The ID of the outbound shipment
Example Response
{
  "data": [
    {
      "id": "019953ae-7a0d-7342-956a-881dcdbe42ad",
      "created_at": "2025-09-16T17:59:28.000000Z",
      "updated_at": "2025-09-16T18:00:05.000000Z",
      "name": "Eagle Eye Engineering",
      "ship_from_address": {
        "name": "AL Warehouse",
        "address_line_1": "1300 Montgomery Highway",
        "address_line_2": "Suite 109",
        "company_name": null,
        "district_or_county": null,
        "city": "Vestavia Hills",
        "state_or_province_code": "AL",
        "country_code": "US",
        "postal_code": "35216-9520",
        "email": null,
        "phone_number": "1234567890"
      },
      "marketplace": {
        "identifier": "ATVPDKIKX0DER",
        "country": "United States"
      },
      "outbound_shipment_id": 5,
      "channel_id": 1,
      "inbound_plan_id": "XlJbBi51GdqP9yfQDUQA43EI0VrQ7mJdlzfLmY",
      "create_plan_operation_id": "019953ae-7a0d-7342-956a-881dcd7b2c81",
      "is_canceled": false,
      "using_2d_barcodes": false,
      "status": "ACTIVE",
      "items": [
        {
          "id": "019953ae-7a0d-7342-956a-881dce3b8a23",
          "created_at": "2025-09-16T17:59:28.000000Z",
          "updated_at": "2025-09-16T17:59:29.000000Z",
          "msku": "Mini-Porta-276810",
          "fnsku": "X00SPO3LCY",
          "asin": "B00ZB18SIF",
          "quantity": 40,
          "label_owner": "SELLER",
          "prep_owner": "SELLER",
          "expiration": null,
          "manufacturing_lot_code": null
        },
        {
          "id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
          "created_at": "2025-09-16T17:59:28.000000Z",
          "updated_at": "2025-09-16T17:59:29.000000Z",
          "msku": "Indoor-H-970476",
          "fnsku": "X00F2SHTOA",
          "asin": "B00XFVE5UF",
          "quantity": 90,
          "label_owner": "SELLER",
          "prep_owner": "SELLER",
          "expiration": null,
          "manufacturing_lot_code": null
        },
        {
          "id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
          "created_at": "2025-09-16T17:59:28.000000Z",
          "updated_at": "2025-09-16T17:59:29.000000Z",
          "msku": "Indoor-A-499395",
          "fnsku": "X00QVBXUTI",
          "asin": "B00VLP0ZXQ",
          "quantity": 90,
          "label_owner": "SELLER",
          "prep_owner": "SELLER",
          "expiration": null,
          "manufacturing_lot_code": null
        },
        {
          "id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
          "created_at": "2025-09-16T17:59:28.000000Z",
          "updated_at": "2025-09-16T17:59:29.000000Z",
          "msku": "Heavy-Du-521708",
          "fnsku": "X005YPO6WK",
          "asin": "B00OGW340B",
          "quantity": 90,
          "label_owner": "SELLER",
          "prep_owner": "SELLER",
          "expiration": null,
          "manufacturing_lot_code": null
        },
        {
          "id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
          "created_at": "2025-09-16T17:59:28.000000Z",
          "updated_at": "2025-09-16T17:59:29.000000Z",
          "msku": "Expandabl-120064",
          "fnsku": "X00MOCGIFI",
          "asin": "B00ZF1JQ03",
          "quantity": 70,
          "label_owner": "SELLER",
          "prep_owner": "SELLER",
          "expiration": null,
          "manufacturing_lot_code": null
        },
        {
          "id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
          "created_at": "2025-09-16T17:59:28.000000Z",
          "updated_at": "2025-09-16T17:59:29.000000Z",
          "msku": "Ergonomi-162819",
          "fnsku": "X00PVZS6RL",
          "asin": "B00SHZC1ZO",
          "quantity": 80,
          "label_owner": "SELLER",
          "prep_owner": "SELLER",
          "expiration": null,
          "manufacturing_lot_code": null
        }
      ],
      "packing_options": [
        {
          "id": "019953ae-8047-71b6-8214-cafa0b1eff32",
          "discounts": [
            {
              "description": "discount",
              "target": "target",
              "type": "DISCOUNT",
              "value": {
                "amount": "12.35",
                "code": "USD"
              }
            }
          ],
          "expiration": null,
          "fees": [
            {
              "description": "fee",
              "target": "target",
              "type": "FEE",
              "value": {
                "amount": "100",
                "code": "USD"
              }
            }
          ],
          "packing_option_id": "pocajn494QJgzId4JWtXCLdl1OyIEeR07fzOk7",
          "status": "OFFERED",
          "supported_shipping_configurations": [
            {
              "shipping_mode": null,
              "shipping_solution": null
            }
          ],
          "confirmed_at": "2025-09-16T17:59:31.000000Z",
          "packing_groups": [
            {
              "id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
              "items": [
                {
                  "id": "019953ae-810a-73e8-8666-4c4dfd9ed734",
                  "planItemId": "019953ae-7a0d-7342-956a-881dce3b8a23",
                  "quantity": 40
                },
                {
                  "id": "019953ae-810b-714c-8dc4-cebd8eccd76d",
                  "planItemId": "019953ae-7a0e-7073-8f7b-39fb3b137865",
                  "quantity": 90
                },
                {
                  "id": "019953ae-810b-714c-8dc4-cebd8f3bb96d",
                  "planItemId": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
                  "quantity": 90
                },
                {
                  "id": "019953ae-810b-714c-8dc4-cebd900bbe34",
                  "planItemId": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
                  "quantity": 90
                },
                {
                  "id": "019953ae-810b-714c-8dc4-cebd90adb15b",
                  "planItemId": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
                  "quantity": 70
                },
                {
                  "id": "019953ae-810b-714c-8dc4-cebd91408023",
                  "planItemId": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
                  "quantity": 80
                }
              ]
            }
          ]
        }
      ],
      "is_packing_information_set": true,
      "box_groups": [
        {
          "id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
          "length_mm": 254,
          "width_mm": 254,
          "height_mm": 254,
          "weight_gm": 4536,
          "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
          "box_numbers": [
            1
          ],
          "items": [
            {
              "id": "019953ae-94e5-7387-9f3b-e8c943fa4400",
              "created_at": "2025-09-16T17:59:34.000000Z",
              "plan_item_id": "019953ae-7a0d-7342-956a-881dce3b8a23",
              "msku": "Mini-Porta-276810",
              "quantity": 40
            }
          ]
        },
        {
          "id": "019953ae-990d-7112-8460-99e06e11ef41",
          "length_mm": 254,
          "width_mm": 254,
          "height_mm": 254,
          "weight_gm": 4536,
          "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
          "box_numbers": [
            2
          ],
          "items": [
            {
              "id": "019953ae-9cb9-715c-8f08-bbe9211a2ddb",
              "created_at": "2025-09-16T17:59:36.000000Z",
              "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
              "msku": "Indoor-H-970476",
              "quantity": 90
            }
          ]
        },
        {
          "id": "019953ae-ade4-7077-9d28-4d2be4df686d",
          "length_mm": 254,
          "width_mm": 254,
          "height_mm": 254,
          "weight_gm": 4536,
          "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
          "box_numbers": [
            3
          ],
          "items": [
            {
              "id": "019953ae-aeab-711d-9c26-a9d4510f1d71",
              "created_at": "2025-09-16T17:59:41.000000Z",
              "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
              "msku": "Indoor-A-499395",
              "quantity": 90
            }
          ]
        },
        {
          "id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
          "length_mm": 254,
          "width_mm": 254,
          "height_mm": 254,
          "weight_gm": 4536,
          "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
          "box_numbers": [
            4
          ],
          "items": [
            {
              "id": "019953ae-b6fd-7047-a274-98fbc9c9f8ea",
              "created_at": "2025-09-16T17:59:43.000000Z",
              "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
              "msku": "Heavy-Du-521708",
              "quantity": 90
            }
          ]
        },
        {
          "id": "019953ae-be1b-71af-85d8-76dc4f441941",
          "length_mm": 254,
          "width_mm": 254,
          "height_mm": 254,
          "weight_gm": 4536,
          "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
          "box_numbers": [
            5
          ],
          "items": [
            {
              "id": "019953ae-bedd-706b-97a7-722fba1cb621",
              "created_at": "2025-09-16T17:59:45.000000Z",
              "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
              "msku": "Expandabl-120064",
              "quantity": 70
            }
          ]
        },
        {
          "id": "019953ae-c534-7297-b05b-87e5a40a9730",
          "length_mm": 254,
          "width_mm": 254,
          "height_mm": 254,
          "weight_gm": 4536,
          "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
          "box_numbers": [
            6
          ],
          "items": [
            {
              "id": "019953ae-c5fb-721e-8b1a-dd1260ad9268",
              "created_at": "2025-09-16T17:59:47.000000Z",
              "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
              "msku": "Ergonomi-162819",
              "quantity": 80
            }
          ]
        }
      ],
      "placement_options": [
        {
          "id": "019953ae-e8f7-7249-a6ff-11661f13e9e9",
          "discounts": [
            {
              "description": "discount",
              "target": "target",
              "type": "DISCOUNT",
              "value": {
                "amount": "3",
                "code": "USD"
              }
            }
          ],
          "expiration": null,
          "fees": [
            {
              "description": "fee",
              "target": "target",
              "type": "FEE",
              "value": {
                "amount": "6",
                "code": "USD"
              }
            }
          ],
          "shipment_ids": [
            "sh-n8xz9SqLSwjnF4ObCQZUNf15CcqJHxJScqJ"
          ],
          "placement_option_id": "po-HEFCAnhLl1Uzj2in",
          "status": "OFFERED",
          "is_selected": false,
          "confirmed_at": null,
          "shipments": [
            {
              "id": "019953ae-e9da-71ad-bb40-0cb62de5e192",
              "shipment_id": "sh-n8xz9SqLSwjnF4ObCQZUNf15CcqJHxJScqJ",
              "amazon_reference_id": null,
              "destination": {
                "address": {
                  "name": "Test - Amazon.com Services",
                  "address_line_1": "20202 K Brink Road",
                  "address_line_2": null,
                  "company_name": null,
                  "district_or_county": null,
                  "city": "AQABA",
                  "state_or_province_code": "AQ",
                  "country_code": "JO",
                  "postal_code": "77110",
                  "email": null,
                  "phone_number": null
                },
                "destination_type": "AMAZON_WAREHOUSE",
                "warehouse_id": "AQ305"
              },
              "source": {
                "address": {
                  "name": "Amazon.com Services LLC",
                  "address_line_1": "18900 W McDowell Road",
                  "address_line_2": null,
                  "company_name": null,
                  "district_or_county": null,
                  "city": "BUCKEYE",
                  "state_or_province_code": "AZ",
                  "country_code": "US",
                  "postal_code": "85326",
                  "email": null,
                  "phone_number": null
                },
                "source_type": "SELLER_FACILITY"
              },
              "status": "UNCONFIRMED",
              "shipment_confirmation_id": null,
              "first_availability_date": null,
              "transport_mode_preference": null,
              "tracking_details": null,
              "contact_information": {
                "name": null,
                "email": null,
                "phone_number": null
              },
              "freight_information": {
                "freight_class": null,
                "declaredValue": null
              },
              "selected_transportation_option_id": null,
              "selected_delivery_window": null,
              "pallets": [],
              "box_groups": [
                {
                  "id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-94e5-7387-9f3b-e8c943fa4400",
                      "created_at": "2025-09-16T17:59:34.000000Z",
                      "plan_item_id": "019953ae-7a0d-7342-956a-881dce3b8a23",
                      "msku": "Mini-Porta-276810",
                      "quantity": 40
                    }
                  ]
                },
                {
                  "id": "019953ae-990d-7112-8460-99e06e11ef41",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-9cb9-715c-8f08-bbe9211a2ddb",
                      "created_at": "2025-09-16T17:59:36.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
                      "msku": "Indoor-H-970476",
                      "quantity": 90
                    }
                  ]
                },
                {
                  "id": "019953ae-ade4-7077-9d28-4d2be4df686d",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-aeab-711d-9c26-a9d4510f1d71",
                      "created_at": "2025-09-16T17:59:41.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
                      "msku": "Indoor-A-499395",
                      "quantity": 90
                    }
                  ]
                },
                {
                  "id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-b6fd-7047-a274-98fbc9c9f8ea",
                      "created_at": "2025-09-16T17:59:43.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
                      "msku": "Heavy-Du-521708",
                      "quantity": 90
                    }
                  ]
                },
                {
                  "id": "019953ae-be1b-71af-85d8-76dc4f441941",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-bedd-706b-97a7-722fba1cb621",
                      "created_at": "2025-09-16T17:59:45.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
                      "msku": "Expandabl-120064",
                      "quantity": 70
                    }
                  ]
                },
                {
                  "id": "019953ae-c534-7297-b05b-87e5a40a9730",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-c5fb-721e-8b1a-dd1260ad9268",
                      "created_at": "2025-09-16T17:59:47.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
                      "msku": "Ergonomi-162819",
                      "quantity": 80
                    }
                  ]
                }
              ],
              "boxes": [],
              "items": [],
              "delivery_window_options": [],
              "transportation_options": []
            }
          ]
        },
        {
          "id": "019953ae-e8f7-7249-a6ff-11661fb31500",
          "discounts": [
            {
              "description": "discount",
              "target": "target",
              "type": "DISCOUNT",
              "value": {
                "amount": "5",
                "code": "USD"
              }
            }
          ],
          "expiration": null,
          "fees": [
            {
              "description": "fee",
              "target": "target",
              "type": "FEE",
              "value": {
                "amount": "56",
                "code": "USD"
              }
            }
          ],
          "shipment_ids": [
            "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ"
          ],
          "placement_option_id": "po-bin91oUMliluMEjJ",
          "status": "OFFERED",
          "is_selected": true,
          "confirmed_at": "2025-09-16T18:00:04.000000Z",
          "shipments": [
            {
              "id": "019953ae-e9da-722f-8355-020272729974",
              "shipment_id": "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ",
              "amazon_reference_id": "amazon_refrence_id",
              "destination": {
                "address": {
                  "name": "Amazon.com Services LLC",
                  "address_line_1": "18900 W McDowell Road",
                  "address_line_2": null,
                  "company_name": null,
                  "district_or_county": null,
                  "city": "BUCKEYE",
                  "state_or_province_code": "AZ",
                  "country_code": "US",
                  "postal_code": "85326",
                  "email": null,
                  "phone_number": null
                },
                "destination_type": "AMAZON_WAREHOUSE",
                "warehouse_id": "GEU3"
              },
              "source": {
                "address": {
                  "name": "Amazon.com Services LLC",
                  "address_line_1": "18900 W McDowell Road",
                  "address_line_2": null,
                  "company_name": null,
                  "district_or_county": null,
                  "city": "BUCKEYE",
                  "state_or_province_code": "AZ",
                  "country_code": "US",
                  "postal_code": "85326",
                  "email": null,
                  "phone_number": null
                },
                "source_type": "SELLER_FACILITY"
              },
              "status": "UNCONFIRMED",
              "shipment_confirmation_id": "SH-CONFIRM001",
              "first_availability_date": "2025-09-16T18:04:57.565179Z",
              "transport_mode_preference": "PARTNERED_GROUND_SMALL_PARCEL",
              "tracking_details": {
                "ltl_tracking_detail": null,
                "spd_tracking_detail": null
              },
              "contact_information": {
                "name": null,
                "email": null,
                "phone_number": null
              },
              "freight_information": {
                "freight_class": null,
                "declaredValue": null
              },
              "selected_transportation_option_id": "to-b778b480-a265-4590-aba7-0e5cfb727335",
              "selected_delivery_window": null,
              "pallets": [],
              "box_groups": [
                {
                  "id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-94e5-7387-9f3b-e8c943fa4400",
                      "created_at": "2025-09-16T17:59:34.000000Z",
                      "plan_item_id": "019953ae-7a0d-7342-956a-881dce3b8a23",
                      "msku": "Mini-Porta-276810",
                      "quantity": 40
                    }
                  ]
                },
                {
                  "id": "019953ae-990d-7112-8460-99e06e11ef41",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-9cb9-715c-8f08-bbe9211a2ddb",
                      "created_at": "2025-09-16T17:59:36.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
                      "msku": "Indoor-H-970476",
                      "quantity": 90
                    }
                  ]
                },
                {
                  "id": "019953ae-ade4-7077-9d28-4d2be4df686d",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-aeab-711d-9c26-a9d4510f1d71",
                      "created_at": "2025-09-16T17:59:41.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
                      "msku": "Indoor-A-499395",
                      "quantity": 90
                    }
                  ]
                },
                {
                  "id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-b6fd-7047-a274-98fbc9c9f8ea",
                      "created_at": "2025-09-16T17:59:43.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
                      "msku": "Heavy-Du-521708",
                      "quantity": 90
                    }
                  ]
                },
                {
                  "id": "019953ae-be1b-71af-85d8-76dc4f441941",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-bedd-706b-97a7-722fba1cb621",
                      "created_at": "2025-09-16T17:59:45.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
                      "msku": "Expandabl-120064",
                      "quantity": 70
                    }
                  ]
                },
                {
                  "id": "019953ae-c534-7297-b05b-87e5a40a9730",
                  "length_mm": 254,
                  "width_mm": 254,
                  "height_mm": 254,
                  "weight_gm": 4536,
                  "number_of_boxes": 1,
                  "box_numbers": [],
                  "items": [
                    {
                      "id": "019953ae-c5fb-721e-8b1a-dd1260ad9268",
                      "created_at": "2025-09-16T17:59:47.000000Z",
                      "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
                      "msku": "Ergonomi-162819",
                      "quantity": 80
                    }
                  ]
                }
              ],
              "boxes": [
                {
                  "id": "019953ae-be74-714f-9d91-9f72f5103073",
                  "box_group_id": "019953ae-be1b-71af-85d8-76dc4f441941",
                  "amazon_box_id": "SH-CONFIRM0011253",
                  "box_number": 5
                },
                {
                  "id": "019953ae-947a-724a-8e35-bc3c5ec39892",
                  "box_group_id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
                  "amazon_box_id": "SH-CONFIRM0012743",
                  "box_number": 1
                },
                {
                  "id": "019953ae-9967-721b-b6a8-b5475993a114",
                  "box_group_id": "019953ae-990d-7112-8460-99e06e11ef41",
                  "amazon_box_id": "SH-CONFIRM0014166",
                  "box_number": 2
                },
                {
                  "id": "019953ae-ae43-72c0-969b-09a15a69ae3f",
                  "box_group_id": "019953ae-ade4-7077-9d28-4d2be4df686d",
                  "amazon_box_id": "SH-CONFIRM0015063",
                  "box_number": 3
                },
                {
                  "id": "019953ae-c592-7035-840b-e8dc4f82e8cb",
                  "box_group_id": "019953ae-c534-7297-b05b-87e5a40a9730",
                  "amazon_box_id": "SH-CONFIRM0015780",
                  "box_number": 6
                },
                {
                  "id": "019953ae-b68f-7167-9fb3-3e404b759466",
                  "box_group_id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
                  "amazon_box_id": "SH-CONFIRM0016344",
                  "box_number": 4
                }
              ],
              "items": [],
              "delivery_window_options": [],
              "transportation_options": [
                {
                  "id": "019953ae-fbd1-716a-9c87-565479d80410",
                  "created_at": "2025-09-16T18:00:01.000000Z",
                  "transportation_option_id": "to-b92bad1c-e226-4bc3-899b-e23f5c1decdc",
                  "shipment_id": "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ",
                  "shipping_mode": "GROUND_SMALL_PARCEL",
                  "shipping_solution": "AMAZON_PARTNERED_CARRIER",
                  "carrier": {
                    "alpha_code": "U",
                    "name": "UPS"
                  },
                  "carrier_appointment": {
                    "start_time": "2025-09-16T18:04:57.565179Z",
                    "end_time": "2025-09-19T18:04:57.565179Z"
                  },
                  "preconditions": [
                    "Precondition: None"
                  ],
                  "quote": {
                    "cost": {
                      "amount": "4",
                      "code": "USD"
                    },
                    "expiration": null,
                    "voidable_until": null
                  },
                  "confirmed_at": null
                },
                {
                  "id": "019953ae-fbd1-716a-9c87-56547a8f7802",
                  "created_at": "2025-09-16T18:00:01.000000Z",
                  "transportation_option_id": "to-b778b480-a265-4590-aba7-0e5cfb727335",
                  "shipment_id": "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ",
                  "shipping_mode": "GROUND_SMALL_PARCEL",
                  "shipping_solution": "AMAZON_PARTNERED_CARRIER",
                  "carrier": {
                    "alpha_code": "D",
                    "name": "DHL"
                  },
                  "carrier_appointment": {
                    "start_time": "2025-09-16T18:04:57.565179Z",
                    "end_time": "2025-09-19T18:04:57.565179Z"
                  },
                  "preconditions": [
                    "Precondition: None"
                  ],
                  "quote": {
                    "cost": {
                      "amount": "10",
                      "code": "USD"
                    },
                    "expiration": null,
                    "voidable_until": null
                  },
                  "confirmed_at": "2025-09-16T18:00:05.000000Z"
                }
              ]
            }
          ]
        }
      ],
      "isPackingInfoKnown": null
    }
  ]
}
Show
Retrieve a specific plan

GET
/fba-transport/v2024/plans/{PLAN_ID}
Example Response
{
  "data": {
    "id": "019953ae-7a0d-7342-956a-881dcdbe42ad",
    "created_at": "2025-09-16T17:59:28.000000Z",
    "updated_at": "2025-09-16T18:00:05.000000Z",
    "name": "Eagle Eye Engineering",
    "ship_from_address": {
      "name": "AL Warehouse",
      "address_line_1": "1300 Montgomery Highway",
      "address_line_2": "Suite 109",
      "company_name": null,
      "district_or_county": null,
      "city": "Vestavia Hills",
      "state_or_province_code": "AL",
      "country_code": "US",
      "postal_code": "35216-9520",
      "email": null,
      "phone_number": "1234567890"
    },
    "marketplace": {
      "identifier": "ATVPDKIKX0DER",
      "country": "United States"
    },
    "outbound_shipment_id": 5,
    "channel_id": 1,
    "inbound_plan_id": "XlJbBi51GdqP9yfQDUQA43EI0VrQ7mJdlzfLmY",
    "create_plan_operation_id": "019953ae-7a0d-7342-956a-881dcd7b2c81",
    "is_canceled": false,
    "using_2d_barcodes": false,
    "status": "ACTIVE",
    "items": [
      {
        "id": "019953ae-7a0d-7342-956a-881dce3b8a23",
        "created_at": "2025-09-16T17:59:28.000000Z",
        "updated_at": "2025-09-16T17:59:29.000000Z",
        "msku": "Mini-Porta-276810",
        "fnsku": "X00SPO3LCY",
        "asin": "B00ZB18SIF",
        "quantity": 40,
        "label_owner": "SELLER",
        "prep_owner": "SELLER",
        "expiration": null,
        "manufacturing_lot_code": null
      },
      {
        "id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
        "created_at": "2025-09-16T17:59:28.000000Z",
        "updated_at": "2025-09-16T17:59:29.000000Z",
        "msku": "Indoor-H-970476",
        "fnsku": "X00F2SHTOA",
        "asin": "B00XFVE5UF",
        "quantity": 90,
        "label_owner": "SELLER",
        "prep_owner": "SELLER",
        "expiration": null,
        "manufacturing_lot_code": null
      },
      {
        "id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
        "created_at": "2025-09-16T17:59:28.000000Z",
        "updated_at": "2025-09-16T17:59:29.000000Z",
        "msku": "Indoor-A-499395",
        "fnsku": "X00QVBXUTI",
        "asin": "B00VLP0ZXQ",
        "quantity": 90,
        "label_owner": "SELLER",
        "prep_owner": "SELLER",
        "expiration": null,
        "manufacturing_lot_code": null
      },
      {
        "id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
        "created_at": "2025-09-16T17:59:28.000000Z",
        "updated_at": "2025-09-16T17:59:29.000000Z",
        "msku": "Heavy-Du-521708",
        "fnsku": "X005YPO6WK",
        "asin": "B00OGW340B",
        "quantity": 90,
        "label_owner": "SELLER",
        "prep_owner": "SELLER",
        "expiration": null,
        "manufacturing_lot_code": null
      },
      {
        "id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
        "created_at": "2025-09-16T17:59:28.000000Z",
        "updated_at": "2025-09-16T17:59:29.000000Z",
        "msku": "Expandabl-120064",
        "fnsku": "X00MOCGIFI",
        "asin": "B00ZF1JQ03",
        "quantity": 70,
        "label_owner": "SELLER",
        "prep_owner": "SELLER",
        "expiration": null,
        "manufacturing_lot_code": null
      },
      {
        "id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
        "created_at": "2025-09-16T17:59:28.000000Z",
        "updated_at": "2025-09-16T17:59:29.000000Z",
        "msku": "Ergonomi-162819",
        "fnsku": "X00PVZS6RL",
        "asin": "B00SHZC1ZO",
        "quantity": 80,
        "label_owner": "SELLER",
        "prep_owner": "SELLER",
        "expiration": null,
        "manufacturing_lot_code": null
      }
    ],
    "packing_options": [
      {
        "id": "019953ae-8047-71b6-8214-cafa0b1eff32",
        "discounts": [
          {
            "description": "discount",
            "target": "target",
            "type": "DISCOUNT",
            "value": {
              "amount": "12.35",
              "code": "USD"
            }
          }
        ],
        "expiration": null,
        "fees": [
          {
            "description": "fee",
            "target": "target",
            "type": "FEE",
            "value": {
              "amount": "100",
              "code": "USD"
            }
          }
        ],
        "packing_option_id": "pocajn494QJgzId4JWtXCLdl1OyIEeR07fzOk7",
        "status": "OFFERED",
        "supported_shipping_configurations": [
          {
            "shipping_mode": null,
            "shipping_solution": null
          }
        ],
        "confirmed_at": "2025-09-16T17:59:31.000000Z",
        "packing_groups": [
          {
            "id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
            "items": [
              {
                "id": "019953ae-810a-73e8-8666-4c4dfd9ed734",
                "planItemId": "019953ae-7a0d-7342-956a-881dce3b8a23",
                "quantity": 40
              },
              {
                "id": "019953ae-810b-714c-8dc4-cebd8eccd76d",
                "planItemId": "019953ae-7a0e-7073-8f7b-39fb3b137865",
                "quantity": 90
              },
              {
                "id": "019953ae-810b-714c-8dc4-cebd8f3bb96d",
                "planItemId": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
                "quantity": 90
              },
              {
                "id": "019953ae-810b-714c-8dc4-cebd900bbe34",
                "planItemId": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
                "quantity": 90
              },
              {
                "id": "019953ae-810b-714c-8dc4-cebd90adb15b",
                "planItemId": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
                "quantity": 70
              },
              {
                "id": "019953ae-810b-714c-8dc4-cebd91408023",
                "planItemId": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
                "quantity": 80
              }
            ]
          }
        ]
      }
    ],
    "is_packing_information_set": true,
    "box_groups": [
      {
        "id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
        "length_mm": 254,
        "width_mm": 254,
        "height_mm": 254,
        "weight_gm": 4536,
        "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
        "box_numbers": [
          1
        ],
        "items": [
          {
            "id": "019953ae-94e5-7387-9f3b-e8c943fa4400",
            "created_at": "2025-09-16T17:59:34.000000Z",
            "plan_item_id": "019953ae-7a0d-7342-956a-881dce3b8a23",
            "msku": "Mini-Porta-276810",
            "quantity": 40
          }
        ]
      },
      {
        "id": "019953ae-990d-7112-8460-99e06e11ef41",
        "length_mm": 254,
        "width_mm": 254,
        "height_mm": 254,
        "weight_gm": 4536,
        "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
        "box_numbers": [
          2
        ],
        "items": [
          {
            "id": "019953ae-9cb9-715c-8f08-bbe9211a2ddb",
            "created_at": "2025-09-16T17:59:36.000000Z",
            "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
            "msku": "Indoor-H-970476",
            "quantity": 90
          }
        ]
      },
      {
        "id": "019953ae-ade4-7077-9d28-4d2be4df686d",
        "length_mm": 254,
        "width_mm": 254,
        "height_mm": 254,
        "weight_gm": 4536,
        "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
        "box_numbers": [
          3
        ],
        "items": [
          {
            "id": "019953ae-aeab-711d-9c26-a9d4510f1d71",
            "created_at": "2025-09-16T17:59:41.000000Z",
            "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
            "msku": "Indoor-A-499395",
            "quantity": 90
          }
        ]
      },
      {
        "id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
        "length_mm": 254,
        "width_mm": 254,
        "height_mm": 254,
        "weight_gm": 4536,
        "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
        "box_numbers": [
          4
        ],
        "items": [
          {
            "id": "019953ae-b6fd-7047-a274-98fbc9c9f8ea",
            "created_at": "2025-09-16T17:59:43.000000Z",
            "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
            "msku": "Heavy-Du-521708",
            "quantity": 90
          }
        ]
      },
      {
        "id": "019953ae-be1b-71af-85d8-76dc4f441941",
        "length_mm": 254,
        "width_mm": 254,
        "height_mm": 254,
        "weight_gm": 4536,
        "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
        "box_numbers": [
          5
        ],
        "items": [
          {
            "id": "019953ae-bedd-706b-97a7-722fba1cb621",
            "created_at": "2025-09-16T17:59:45.000000Z",
            "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
            "msku": "Expandabl-120064",
            "quantity": 70
          }
        ]
      },
      {
        "id": "019953ae-c534-7297-b05b-87e5a40a9730",
        "length_mm": 254,
        "width_mm": 254,
        "height_mm": 254,
        "weight_gm": 4536,
        "packing_group_id": "pgLHANgRWnu84l8oX6FtLhNFgAyNcuk8Hme0MA",
        "box_numbers": [
          6
        ],
        "items": [
          {
            "id": "019953ae-c5fb-721e-8b1a-dd1260ad9268",
            "created_at": "2025-09-16T17:59:47.000000Z",
            "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
            "msku": "Ergonomi-162819",
            "quantity": 80
          }
        ]
      }
    ],
    "placement_options": [
      {
        "id": "019953ae-e8f7-7249-a6ff-11661f13e9e9",
        "discounts": [
          {
            "description": "discount",
            "target": "target",
            "type": "DISCOUNT",
            "value": {
              "amount": "3",
              "code": "USD"
            }
          }
        ],
        "expiration": null,
        "fees": [
          {
            "description": "fee",
            "target": "target",
            "type": "FEE",
            "value": {
              "amount": "6",
              "code": "USD"
            }
          }
        ],
        "shipment_ids": [
          "sh-n8xz9SqLSwjnF4ObCQZUNf15CcqJHxJScqJ"
        ],
        "placement_option_id": "po-HEFCAnhLl1Uzj2in",
        "status": "OFFERED",
        "is_selected": false,
        "confirmed_at": null,
        "shipments": [
          {
            "id": "019953ae-e9da-71ad-bb40-0cb62de5e192",
            "shipment_id": "sh-n8xz9SqLSwjnF4ObCQZUNf15CcqJHxJScqJ",
            "amazon_reference_id": null,
            "destination": {
              "address": {
                "name": "Test - Amazon.com Services",
                "address_line_1": "20202 K Brink Road",
                "address_line_2": null,
                "company_name": null,
                "district_or_county": null,
                "city": "AQABA",
                "state_or_province_code": "AQ",
                "country_code": "JO",
                "postal_code": "77110",
                "email": null,
                "phone_number": null
              },
              "destination_type": "AMAZON_WAREHOUSE",
              "warehouse_id": "AQ305"
            },
            "source": {
              "address": {
                "name": "Amazon.com Services LLC",
                "address_line_1": "18900 W McDowell Road",
                "address_line_2": null,
                "company_name": null,
                "district_or_county": null,
                "city": "BUCKEYE",
                "state_or_province_code": "AZ",
                "country_code": "US",
                "postal_code": "85326",
                "email": null,
                "phone_number": null
              },
              "source_type": "SELLER_FACILITY"
            },
            "status": "UNCONFIRMED",
            "shipment_confirmation_id": null,
            "first_availability_date": null,
            "transport_mode_preference": null,
            "tracking_details": null,
            "contact_information": {
              "name": null,
              "email": null,
              "phone_number": null
            },
            "freight_information": {
              "freight_class": null,
              "declaredValue": null
            },
            "selected_transportation_option_id": null,
            "selected_delivery_window": null,
            "pallets": [],
            "box_groups": [
              {
                "id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-94e5-7387-9f3b-e8c943fa4400",
                    "created_at": "2025-09-16T17:59:34.000000Z",
                    "plan_item_id": "019953ae-7a0d-7342-956a-881dce3b8a23",
                    "msku": "Mini-Porta-276810",
                    "quantity": 40
                  }
                ]
              },
              {
                "id": "019953ae-990d-7112-8460-99e06e11ef41",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-9cb9-715c-8f08-bbe9211a2ddb",
                    "created_at": "2025-09-16T17:59:36.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
                    "msku": "Indoor-H-970476",
                    "quantity": 90
                  }
                ]
              },
              {
                "id": "019953ae-ade4-7077-9d28-4d2be4df686d",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-aeab-711d-9c26-a9d4510f1d71",
                    "created_at": "2025-09-16T17:59:41.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
                    "msku": "Indoor-A-499395",
                    "quantity": 90
                  }
                ]
              },
              {
                "id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-b6fd-7047-a274-98fbc9c9f8ea",
                    "created_at": "2025-09-16T17:59:43.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
                    "msku": "Heavy-Du-521708",
                    "quantity": 90
                  }
                ]
              },
              {
                "id": "019953ae-be1b-71af-85d8-76dc4f441941",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-bedd-706b-97a7-722fba1cb621",
                    "created_at": "2025-09-16T17:59:45.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
                    "msku": "Expandabl-120064",
                    "quantity": 70
                  }
                ]
              },
              {
                "id": "019953ae-c534-7297-b05b-87e5a40a9730",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-c5fb-721e-8b1a-dd1260ad9268",
                    "created_at": "2025-09-16T17:59:47.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
                    "msku": "Ergonomi-162819",
                    "quantity": 80
                  }
                ]
              }
            ],
            "boxes": [],
            "items": [],
            "delivery_window_options": [],
            "transportation_options": []
          }
        ]
      },
      {
        "id": "019953ae-e8f7-7249-a6ff-11661fb31500",
        "discounts": [
          {
            "description": "discount",
            "target": "target",
            "type": "DISCOUNT",
            "value": {
              "amount": "5",
              "code": "USD"
            }
          }
        ],
        "expiration": null,
        "fees": [
          {
            "description": "fee",
            "target": "target",
            "type": "FEE",
            "value": {
              "amount": "56",
              "code": "USD"
            }
          }
        ],
        "shipment_ids": [
          "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ"
        ],
        "placement_option_id": "po-bin91oUMliluMEjJ",
        "status": "OFFERED",
        "is_selected": true,
        "confirmed_at": "2025-09-16T18:00:04.000000Z",
        "shipments": [
          {
            "id": "019953ae-e9da-722f-8355-020272729974",
            "shipment_id": "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ",
            "amazon_reference_id": "amazon_refrence_id",
            "destination": {
              "address": {
                "name": "Amazon.com Services LLC",
                "address_line_1": "18900 W McDowell Road",
                "address_line_2": null,
                "company_name": null,
                "district_or_county": null,
                "city": "BUCKEYE",
                "state_or_province_code": "AZ",
                "country_code": "US",
                "postal_code": "85326",
                "email": null,
                "phone_number": null
              },
              "destination_type": "AMAZON_WAREHOUSE",
              "warehouse_id": "GEU3"
            },
            "source": {
              "address": {
                "name": "Amazon.com Services LLC",
                "address_line_1": "18900 W McDowell Road",
                "address_line_2": null,
                "company_name": null,
                "district_or_county": null,
                "city": "BUCKEYE",
                "state_or_province_code": "AZ",
                "country_code": "US",
                "postal_code": "85326",
                "email": null,
                "phone_number": null
              },
              "source_type": "SELLER_FACILITY"
            },
            "status": "UNCONFIRMED",
            "shipment_confirmation_id": "SH-CONFIRM001",
            "first_availability_date": "2025-09-16T18:04:57.565179Z",
            "transport_mode_preference": "PARTNERED_GROUND_SMALL_PARCEL",
            "tracking_details": {
              "ltl_tracking_detail": null,
              "spd_tracking_detail": null
            },
            "contact_information": {
              "name": null,
              "email": null,
              "phone_number": null
            },
            "freight_information": {
              "freight_class": null,
              "declaredValue": null
            },
            "selected_transportation_option_id": "to-b778b480-a265-4590-aba7-0e5cfb727335",
            "selected_delivery_window": null,
            "pallets": [],
            "box_groups": [
              {
                "id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-94e5-7387-9f3b-e8c943fa4400",
                    "created_at": "2025-09-16T17:59:34.000000Z",
                    "plan_item_id": "019953ae-7a0d-7342-956a-881dce3b8a23",
                    "msku": "Mini-Porta-276810",
                    "quantity": 40
                  }
                ]
              },
              {
                "id": "019953ae-990d-7112-8460-99e06e11ef41",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-9cb9-715c-8f08-bbe9211a2ddb",
                    "created_at": "2025-09-16T17:59:36.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b137865",
                    "msku": "Indoor-H-970476",
                    "quantity": 90
                  }
                ]
              },
              {
                "id": "019953ae-ade4-7077-9d28-4d2be4df686d",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-aeab-711d-9c26-a9d4510f1d71",
                    "created_at": "2025-09-16T17:59:41.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3b9219c0",
                    "msku": "Indoor-A-499395",
                    "quantity": 90
                  }
                ]
              },
              {
                "id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-b6fd-7047-a274-98fbc9c9f8ea",
                    "created_at": "2025-09-16T17:59:43.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3bc884cb",
                    "msku": "Heavy-Du-521708",
                    "quantity": 90
                  }
                ]
              },
              {
                "id": "019953ae-be1b-71af-85d8-76dc4f441941",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-bedd-706b-97a7-722fba1cb621",
                    "created_at": "2025-09-16T17:59:45.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c0998bc",
                    "msku": "Expandabl-120064",
                    "quantity": 70
                  }
                ]
              },
              {
                "id": "019953ae-c534-7297-b05b-87e5a40a9730",
                "length_mm": 254,
                "width_mm": 254,
                "height_mm": 254,
                "weight_gm": 4536,
                "number_of_boxes": 1,
                "box_numbers": [],
                "items": [
                  {
                    "id": "019953ae-c5fb-721e-8b1a-dd1260ad9268",
                    "created_at": "2025-09-16T17:59:47.000000Z",
                    "plan_item_id": "019953ae-7a0e-7073-8f7b-39fb3c76c668",
                    "msku": "Ergonomi-162819",
                    "quantity": 80
                  }
                ]
              }
            ],
            "boxes": [
              {
                "id": "019953ae-be74-714f-9d91-9f72f5103073",
                "box_group_id": "019953ae-be1b-71af-85d8-76dc4f441941",
                "amazon_box_id": "SH-CONFIRM0011253",
                "box_number": 5
              },
              {
                "id": "019953ae-947a-724a-8e35-bc3c5ec39892",
                "box_group_id": "019953ae-941c-7133-8f14-e18e2bfe8af6",
                "amazon_box_id": "SH-CONFIRM0012743",
                "box_number": 1
              },
              {
                "id": "019953ae-9967-721b-b6a8-b5475993a114",
                "box_group_id": "019953ae-990d-7112-8460-99e06e11ef41",
                "amazon_box_id": "SH-CONFIRM0014166",
                "box_number": 2
              },
              {
                "id": "019953ae-ae43-72c0-969b-09a15a69ae3f",
                "box_group_id": "019953ae-ade4-7077-9d28-4d2be4df686d",
                "amazon_box_id": "SH-CONFIRM0015063",
                "box_number": 3
              },
              {
                "id": "019953ae-c592-7035-840b-e8dc4f82e8cb",
                "box_group_id": "019953ae-c534-7297-b05b-87e5a40a9730",
                "amazon_box_id": "SH-CONFIRM0015780",
                "box_number": 6
              },
              {
                "id": "019953ae-b68f-7167-9fb3-3e404b759466",
                "box_group_id": "019953ae-b62e-7365-b4e2-2b8e37cbdf13",
                "amazon_box_id": "SH-CONFIRM0016344",
                "box_number": 4
              }
            ],
            "items": [],
            "delivery_window_options": [],
            "transportation_options": [
              {
                "id": "019953ae-fbd1-716a-9c87-565479d80410",
                "created_at": "2025-09-16T18:00:01.000000Z",
                "transportation_option_id": "to-b92bad1c-e226-4bc3-899b-e23f5c1decdc",
                "shipment_id": "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ",
                "shipping_mode": "GROUND_SMALL_PARCEL",
                "shipping_solution": "AMAZON_PARTNERED_CARRIER",
                "carrier": {
                  "alpha_code": "U",
                  "name": "UPS"
                },
                "carrier_appointment": {
                  "start_time": "2025-09-16T18:04:57.565179Z",
                  "end_time": "2025-09-19T18:04:57.565179Z"
                },
                "preconditions": [
                  "Precondition: None"
                ],
                "quote": {
                  "cost": {
                    "amount": "4",
                    "code": "USD"
                  },
                  "expiration": null,
                  "voidable_until": null
                },
                "confirmed_at": null
              },
              {
                "id": "019953ae-fbd1-716a-9c87-56547a8f7802",
                "created_at": "2025-09-16T18:00:01.000000Z",
                "transportation_option_id": "to-b778b480-a265-4590-aba7-0e5cfb727335",
                "shipment_id": "sh-oP7TqAygyvMpRoDO3pCkCrJThV3Ot1N1JpQ",
                "shipping_mode": "GROUND_SMALL_PARCEL",
                "shipping_solution": "AMAZON_PARTNERED_CARRIER",
                "carrier": {
                  "alpha_code": "D",
                  "name": "DHL"
                },
                "carrier_appointment": {
                  "start_time": "2025-09-16T18:04:57.565179Z",
                  "end_time": "2025-09-19T18:04:57.565179Z"
                },
                "preconditions": [
                  "Precondition: None"
                ],
                "quote": {
                  "cost": {
                    "amount": "10",
                    "code": "USD"
                  },
                  "expiration": null,
                  "voidable_until": null
                },
                "confirmed_at": "2025-09-16T18:00:05.000000Z"
              }
            ]
          }
        ]
      }
    ],
    "isPackingInfoKnown": null
  }
}
Labels
Retrieve the labels for a specific plan and shipment

GET
/fba-transport/v2024/plans/{PLAN_ID}/labels?shipment_id={SHIPMENT_ID}
Example Response
{
  "data": [
    {
      "id": "019b2286-9fee-71de-9f64-154824d3aa4d",
      "created_at": "2025-12-15T15:00:07.000000Z",
      "updated_at": "2025-12-15T15:00:07.000000Z",
      "name": "Amazon Package/Carton Labels (8.5\" x 11\")",
      "url": "http://demo.conveyr.test/storage/fba-transport/SH-CONFIRM001/amazon-packagecarton-labels-85-x-11.pdf",
      "type": "package",
      "paper_size": "PackageLabel_Letter_2"
    }
  ]
}

### Orders
Making calls to the orders API

Index
Get a list of all orders.

GET
/orders
Example Response
{
  "orders": [
    {
      "id": 1,
      "created_at": "2022-03-22T13:02:07.000000Z",
      "updated_at": "2022-03-22T13:02:07.000000Z",
      "customer_id": 1,
      "shipping_address_id": 28,
      "billing_address_id": 28,
      "order_id": "AYV-411841-64",
      "channel_id": 1,
      "channel_order_id": "CGZ-211973-62",
      "order_date": "2022-03-19 09:02:06",
      "ship_by": "2022-03-23 09:02:06",
      "arrive_by": "2022-03-25 09:02:06",
      "status": "pending",
      "warehouse_notes": "Omnis occaecati non ab inventore expedita cupiditate in tempore.",
      "gift_note": "Atque voluptatibus et dolor sed.",
      "shipping_method_preference": "qui",
      "should_fulfill": true,
      "pick_assigned_to": null,
      "pack_assigned_to": null,
      "quotes": null,
      "errors": null,
      "order_items_count": 1,
      "order_items": [
        {
          "id": 1,
          "created_at": null,
          "updated_at": null,
          "order_id": 1,
          "item_id": 11,
          "listing_id": null,
          "quantity": 1,
          "picked_at": null,
          "pick_data": null,
          "item": {
            "id": 11,
            "created_at": "2022-03-22T13:02:02.000000Z",
            "updated_at": "2022-03-22T13:02:06.000000Z",
            "merchant_id": 2,
            "merchant_sku": "OI-Small-Co-696383",
            "title": "Small Concrete Car",
            "condition": "new",
            "condition_note": null,
            "length_mm": 143,
            "width_mm": 71,
            "height_mm": 76,
            "weight_gm": 225,
            "fnsku": "X00N7WF8MY",
            "asin": "B07LDTNHS1",
            "searchableIdentifiers": "B07LDTNHS1,X00N7WF8MY,0751765057210",
            "images": [
              {
                "id": 11,
                "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=11",
                "thumbnail_url": "data:image/png;base64,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"
              }
            ],
            "identifiers": [
              {
                "id": 21,
                "created_at": "2022-03-22T13:02:03.000000Z",
                "updated_at": "2022-03-22T13:02:03.000000Z",
                "identifier": "B07LDTNHS1",
                "identifier_type": "ASIN"
              },
              {
                "id": 22,
                "created_at": "2022-03-22T13:02:03.000000Z",
                "updated_at": "2022-03-22T13:02:03.000000Z",
                "identifier": "X00N7WF8MY",
                "identifier_type": "FNSKU"
              },
              {
                "id": 302,
                "created_at": "2022-03-22T13:02:06.000000Z",
                "updated_at": "2022-03-22T13:02:06.000000Z",
                "identifier": "0751765057210",
                "identifier_type": "EAN"
              }
            ]
          }
        }
      ],
      "customer": {
        "id": 1,
        "created_at": "2022-03-22T13:02:06.000000Z",
        "updated_at": "2022-03-22T13:02:07.000000Z",
        "name": "Paucek, Nicolas and Kihn",
        "merchant_id": 2,
        "channel_id": 1,
        "default_address_id": 3,
        "email": "joberbrunner@hermiston.com",
        "phone_number": "+1-270-754-2271",
        "email_hash": "818614d1f12599d32f5a7739af95e8bdc425d3ab91102852a4ad2e481233467c",
        "name_address_hash": "0f375594f6f3f9dbd730fdf825463a6950da634a014c81dc176e2c46b91ac957"
      }
    }
  ]
}
Upload Orders
Create new orders in bulk

For this call, you are required to set the merchant using the Merchant Header.

POST
/orders/upload
Parameter	Type	Examples	Description
channel_id
Required
integer	5	The ID of the sales channel the orders were placed on
orders
Required
array<Order>	[...]	An array of orders to upload
orders.*.name
Required
string	Jane Doe	The name of the customer that placed the order. Required if first_name and last_name are not set.
orders.*.first_name
Required
string	Jane	The first name of the customer that placed the order. Required if name is not set.
orders.*.last_name
Required
string	Doe	The last name of the customer that placed the order. Required if name is not set.
orders.*.email
Optional
email	janedoe@gmail.com	The email address of the customer that placed the order.
orders.*.phone
Optional
string	+1 555 555 5555	The phone number of the customer that placed the order.
orders.*.address_line_1
Required
string	123 Example St	The first line of the shipping address for the customer that placed the order.
orders.*.address_line_2
Optional
string	Apt 2	The second line of the shipping address for the customer that placed the order.
orders.*.address_line_3
Optional
string	C/O John Doe	The third line of the shipping address for the customer that placed the order.
orders.*.city
Required
string	New York	The city of the shipping address for the customer that placed the order.
orders.*.state_province
Required
string	NY	The province or state of the shipping address for the customer that placed the order.
orders.*.country
Required
string	United States	The country of the shipping address for the customer that placed the order. Required without country_code.
orders.*.country_code
Required
string	US	The country code of the shipping address for the customer that placed the order. Required without country, and is the more reliable way to set the country.
orders.*.postal_code
Required
string	21222	The postal code / ZIP of the shipping address for the customer that placed the order.
orders.*.is_residential
Optional
boolean	true	If the shipping address for the customer that placed the order is a residential address.
orders.*.order_id
Required
string	ORDER-ABC-1234	A unique string that identifies this order
orders.*.order_date
Optional
date	2022-03-22	The date this order was placed
orders.*.gift_note
Optional
string	Congratulations!	A gift note to be included with the order
orders.*.items
Required
array<Item>	See the orders.*.items.* parameters	The items contained in the order
orders.*.items.*.merchant_sku
Required
string	FLN-A-1554	The SKU of the item matching. This should be consistent across all channels
orders.*.items.*.quantity
Required
integer	2	The quantity of this item that was ordered
orders.*.items.*.title
Required
string	Wall-mounted Fan Unit, 18 inch	The title of this item. This will only be used if the item does not already exist on the portal.
Example Response
Show
Get the details of a single order.

GET
/orders/{ORDER_ID}
Example Response
{
  "order": {
    "id": 8,
    "created_at": "2022-09-29T20:51:03.000000Z",
    "updated_at": "2022-10-05T00:41:39.000000Z",
    "customer_id": 8,
    "shipping_address_id": 11,
    "billing_address_id": 11,
    "order_id": "ANX-352231-61",
    "channel_id": 1,
    "channel_order_id": "CWM-286025-86",
    "order_date": "2022-09-28 16:51:03",
    "ship_by": "2022-09-30 16:51:03",
    "arrive_by": "2022-10-04 16:51:03",
    "status": "shipped",
    "warehouse_notes": "Omnis et ad veniam.",
    "gift_note": "Aperiam sunt molestiae qui quas quis.",
    "shipping_method_preference": "explicabo",
    "should_fulfill": true,
    "pick_assigned_to": null,
    "pack_assigned_to": 16,
    "quotes": {
      "selected_quote_id": "d199cdf0-055c-5290-a0f0-ae744689855f",
      "cheapest_quote_id": "d199cdf0-055c-5290-a0f0-ae744689855f",
      "fastest_quote_id": "9facdc6b-dc10-5ecd-8058-3b4bba641e19",
      "preference_quote_ids": [],
      "quotes": [
        {
          "id": "d1ba9f18-1669-5f2a-90c6-38808437d65d",
          "total": {
            "amount": "24.85",
            "currency": "USD"
          },
          "carrier": "usps",
          "service_level": "usps__express",
          "provider": "vanlo",
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "rate_fe465be3cc7fdd6e7fefbc45ab26e6fc",
                "shipment_id": "shp_ff3a57d19471b5ca249808adf62cd667",
                "carrier": "usps",
                "service": "usps__express",
                "rate": {
                  "amount": "24.85",
                  "currency": "USD"
                },
                "to_address_id": "adr_498907a4cb77571438e984eb8148794f",
                "from_address_id": "adr_31ecf882087edf7c94884d9bc8ad4e64"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 5,
                    "width": 5,
                    "height": 5,
                    "weight": 72700
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "prcl_220ea47f6aa49d67cceca40f7de42ee1"
                }
              ]
            }
          ]
        },
        {
          "id": "4958489d-31e5-515c-9068-bca107d4642d",
          "total": {
            "amount": "7.54",
            "currency": "USD"
          },
          "carrier": "usps",
          "service_level": "usps__priority",
          "provider": "vanlo",
          "delivery_date": "2022-10-07 00:00:00",
          "delivery_days": 2,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "rate_5a9bf205b6b3935cd7da95ee7007c97d",
                "shipment_id": "shp_ff3a57d19471b5ca249808adf62cd667",
                "carrier": "usps",
                "service": "usps__priority",
                "rate": {
                  "amount": "7.54",
                  "currency": "USD"
                },
                "delivery_date": "2022-10-07 00:00:00",
                "delivery_days": 2,
                "to_address_id": "adr_498907a4cb77571438e984eb8148794f",
                "from_address_id": "adr_31ecf882087edf7c94884d9bc8ad4e64"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 5,
                    "width": 5,
                    "height": 5,
                    "weight": 72700
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "prcl_220ea47f6aa49d67cceca40f7de42ee1"
                }
              ]
            }
          ]
        },
        {
          "id": "d199cdf0-055c-5290-a0f0-ae744689855f",
          "total": {
            "amount": "6.86",
            "currency": "USD"
          },
          "carrier": "usps",
          "service_level": "usps__parcel_select",
          "provider": "vanlo",
          "delivery_date": "2022-10-07 00:00:00",
          "delivery_days": 2,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "rate_8f751e69b3306ef143e016e4a4b1cb16",
                "shipment_id": "shp_ff3a57d19471b5ca249808adf62cd667",
                "carrier": "usps",
                "service": "usps__parcel_select",
                "rate": {
                  "amount": "6.86",
                  "currency": "USD"
                },
                "delivery_date": "2022-10-07 00:00:00",
                "delivery_days": 2,
                "to_address_id": "adr_498907a4cb77571438e984eb8148794f",
                "from_address_id": "adr_31ecf882087edf7c94884d9bc8ad4e64"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 5,
                    "width": 5,
                    "height": 5,
                    "weight": 72700
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "prcl_220ea47f6aa49d67cceca40f7de42ee1"
                }
              ]
            }
          ]
        },
        {
          "id": "66794d52-8354-5a05-aa55-5afffb879c78",
          "total": {
            "amount": "9.43",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__3_day_select",
          "provider": "shippo",
          "delivery_days": 3,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "ba4fa662e44b4878b96f5e7b45ad160c",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__3_day_select",
                "rate": {
                  "amount": "9.43",
                  "currency": "USD"
                },
                "delivery_days": 3,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        },
        {
          "id": "dcc0b7e7-c84e-53bf-9705-ff65e0b4842c",
          "total": {
            "amount": "10.59",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__second_day_air",
          "provider": "shippo",
          "delivery_days": 2,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "9a0b6f7f22ce4a0e9757171613a8f118",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__second_day_air",
                "rate": {
                  "amount": "10.59",
                  "currency": "USD"
                },
                "delivery_days": 2,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        },
        {
          "id": "da04a3d3-f819-54cd-8af1-3e8c3558296f",
          "total": {
            "amount": "11.98",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__second_day_air_am",
          "provider": "shippo",
          "delivery_date": "2022-10-04 10:30:00",
          "delivery_days": 2,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "58dc531578274c5ca88391f3aa1add60",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__second_day_air_am",
                "rate": {
                  "amount": "11.98",
                  "currency": "USD"
                },
                "delivery_date": "2022-10-04 10:30:00",
                "delivery_days": 2,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        },
        {
          "id": "9facdc6b-dc10-5ecd-8058-3b4bba641e19",
          "total": {
            "amount": "8.22",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__ground",
          "provider": "shippo",
          "delivery_days": 1,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "9d51a94af62043c3892b7c048eb01c64",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__ground",
                "rate": {
                  "amount": "8.22",
                  "currency": "USD"
                },
                "delivery_days": 1,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        },
        {
          "id": "2d5b4643-340a-5ce6-b6e1-ce132b89529d",
          "total": {
            "amount": "16.19",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__next_day_air_saver",
          "provider": "shippo",
          "delivery_date": "2022-10-04 15:00:00",
          "delivery_days": 1,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "29bef961645a4b1d9267e3bf461a5f45",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__next_day_air_saver",
                "rate": {
                  "amount": "16.19",
                  "currency": "USD"
                },
                "delivery_date": "2022-10-04 15:00:00",
                "delivery_days": 1,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        },
        {
          "id": "a5ce5d7a-de93-5016-b115-1502d39d120f",
          "total": {
            "amount": "20.89",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__next_day_air",
          "provider": "shippo",
          "delivery_date": "2022-10-04 10:30:00",
          "delivery_days": 1,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "0d07163720494f81aed426182deabbe8",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__next_day_air",
                "rate": {
                  "amount": "20.89",
                  "currency": "USD"
                },
                "delivery_date": "2022-10-04 10:30:00",
                "delivery_days": 1,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        },
        {
          "id": "ee89a457-1672-5429-bba5-b49c8399f052",
          "total": {
            "amount": "50.59",
            "currency": "USD"
          },
          "carrier": "ups",
          "service_level": "ups__next_day_air_early_am",
          "provider": "shippo",
          "delivery_date": "2022-10-04 08:30:00",
          "delivery_days": 1,
          "quote_items": [
            {
              "carrier_rate": {
                "rate_id": "d968d26fd3494d68847eb4437b6d83b4",
                "shipment_id": "9cfb43182b534565893df9499404046d",
                "carrier": "ups",
                "carrier_account_id": "d4f9889c105b4bfa9a2d0626d3798d44",
                "service": "ups__next_day_air_early_am",
                "rate": {
                  "amount": "50.59",
                  "currency": "USD"
                },
                "delivery_date": "2022-10-04 08:30:00",
                "delivery_days": 1,
                "to_address_id": "72c2577e158c44f69c38c82ef120ddb5",
                "from_address_id": "519c4ba08dbc4247a98cbbfd7d0b0322"
              },
              "parcels": [
                {
                  "dimensions": {
                    "length": 127,
                    "width": 127,
                    "height": 127,
                    "weight": 2061
                  },
                  "internal_parcel_identifier": "pkg_Q5JymjnDxn8qoKl",
                  "carrier_parcel_id": "4c36e20e76d74482aed7e07a5a74e2a2"
                }
              ]
            }
          ]
        }
      ],
      "messages": [
        {
          "source": "UPS",
          "text": "RatedShipmentAlert: Your invoice may vary from the displayed reference rates"
        }
      ],
      "errors": []
    },
    "errors": null,
    "deleted_at": null,
    "currency": "USD",
    "tote_code": null,
    "tracking_numbers": [
      {
        "status": "unknown",
        "number": "9461200205903141100394",
        "carrier": "usps",
        "service_level": "usps__parcel_select",
        "eta": null,
        "transit_at": null,
        "delivered_at": null,
        "returned_at": null,
        "failed_at": null,
        "package_identifier": "pkg_Q5JymjnDxn8qoKl",
        "tracking_url": "https://tools.usps.com/go/TrackConfirmAction_input?qtc_tLabels1=9461200205903141100394",
        "id": 436
      }
    ],
    "order_items": [
      {
        "id": 8,
        "created_at": "2022-09-29T20:51:03.000000Z",
        "updated_at": "2022-09-29T20:51:03.000000Z",
        "order_id": 8,
        "item_id": 6,
        "listing_id": null,
        "quantity": 1,
        "picked_at": null,
        "pick_data": null,
        "external_id": null,
        "item": {
          "id": 6,
          "created_at": "2022-09-29T20:51:02.000000Z",
          "updated_at": "2022-09-29T20:51:02.000000Z",
          "merchant_id": 1,
          "merchant_sku": "OI-Ergonomic-873034",
          "title": "Ergonomic Concrete Plate",
          "condition": "new",
          "condition_note": null,
          "length_mm": 80,
          "width_mm": 155,
          "height_mm": 113,
          "weight_gm": 1607,
          "fnsku": "X003ULKERY",
          "asin": "B08W3QKXI8",
          "searchableIdentifiers": "B08W3QKXI8,X003ULKERY,8993160747972",
          "images": [
            {
              "id": 6,
              "large_url": "https://source.unsplash.com/collection/345710/1500x1500?sig=6",
              "thumbnail_url": "data:image/png;base64,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"
            }
          ],
          "identifiers": [
            {
              "id": 17,
              "created_at": "2022-09-29T20:51:02.000000Z",
              "updated_at": "2022-09-29T20:51:02.000000Z",
              "identifier": "B08W3QKXI8",
              "identifier_type": "ASIN"
            },
            {
              "id": 18,
              "created_at": "2022-09-29T20:51:02.000000Z",
              "updated_at": "2022-09-29T20:51:02.000000Z",
              "identifier": "X003ULKERY",
              "identifier_type": "FNSKU"
            },
            {
              "id": 78,
              "created_at": "2022-09-29T20:51:02.000000Z",
              "updated_at": "2022-09-29T20:51:02.000000Z",
              "identifier": "8993160747972",
              "identifier_type": "EAN"
            }
          ]
        }
      }
    ],
    "customer": {
      "id": 8,
      "created_at": "2022-09-29T20:51:03.000000Z",
      "updated_at": "2022-09-29T20:51:03.000000Z",
      "name": "Gutkowski Inc",
      "merchant_id": 1,
      "channel_id": 1,
      "default_address_id": 11,
      "email": "fay.katherine@gmail.com",
      "phone_number": "678-946-3287",
      "email_hash": "c258b0c54db2cc493c4e18bdb7104bceb0112c51cedb9b9e7a670acfaaf0ea23",
      "name_address_hash": "bec47517788fd87023ee1cb17be7dc00d5bc412ffcd90b85280531cee3b904d2"
    },
    "shipping_address": {
      "id": 11,
      "created_at": "2022-09-29T20:51:03.000000Z",
      "updated_at": "2022-09-29T20:51:03.000000Z",
      "customer_id": 8,
      "address_line_1": "1000 State Route 36",
      "address_line_2": "Suite 395",
      "address_line_3": null,
      "city": "Hornell",
      "state_province": "NY",
      "country_code": "US",
      "postal_code": "14843-7628",
      "phone_number": null,
      "is_residential": false
    },
    "packages": [
      {
        "id": 3,
        "created_at": "2022-10-05T00:41:25.000000Z",
        "updated_at": "2022-10-05T00:41:39.000000Z",
        "order_id": 8,
        "shipped_at": "2022-10-05T00:41:39.000000Z",
        "arrived_at": null,
        "lpn": "prcl_220ea47f6aa49d67cceca40f7de42ee1",
        "hash": "pkg_Q5JymjnDxn8qoKl",
        "box": {
          "id": 375,
          "created_at": "2022-10-05T00:41:25.000000Z",
          "updated_at": "2022-10-05T00:41:25.000000Z",
          "boxable_id": 3,
          "boxable_type": "package",
          "weight_gm": 2061,
          "length_mm": 127,
          "width_mm": 127,
          "height_mm": 127
        },
        "attachments": [
          {
            "id": 5,
            "created_at": "2022-10-05T00:41:39.000000Z",
            "updated_at": "2022-10-05T00:41:39.000000Z",
            "path": "attachments/4JSoebFo49MyOmW4AWNMDcpoDq2GqMShsGrieKnvy6fRGPxM7mZFqvWK1mK49lFjyOsHCtqJPpppdIsCcGUosyUCr6kIUuSUxXJDLCm8Ow7KbNzTzxJfu4pM.pdf",
            "name": "Shipping Label",
            "url": "http://admin.prepbusiness.com/storage/attachments/4JSoebFo49MyOmW4AWNMDcpoDq2GqMShsGrieKnvy6fRGPxM7mZFqvWK1mK49lFjyOsHCtqJPpppdIsCcGUosyUCr6kIUuSUxXJDLCm8Ow7KbNzTzxJfu4pM.pdf",
            "attachable_id": 3,
            "attachable_type": "package"
          }
        ],
        "package_items": [
          {
            "id": 4,
            "created_at": "2022-10-05T00:41:25.000000Z",
            "updated_at": "2022-10-05T00:41:25.000000Z",
            "order_item_id": 8,
            "package_id": 3,
            "quantity": 1,
            "tote_barcode": null,
            "packed_at": null,
            "packed_by_user_id": null,
            "lot_code": null
          }
        ]
      }
    ],
    "attachments": [
      {
        "id": 6,
        "created_at": "2022-10-05T00:41:39.000000Z",
        "updated_at": "2022-10-05T00:41:39.000000Z",
        "path": "attachments/wZC2fpvZTE8Mb0jqmYnw5xVSZsktoqEL0HCBkYJKPTmEQTRbFtCnVppYSvo8kg4D35AvAm8s7d3jiFOQpUrzj8VMpiSUpKLUdDeNbsMrgmPHYHEpnWHOv3JH.pdf",
        "name": "Shipping Label",
        "url": "http://admin.prepbusiness.com/storage/attachments/wZC2fpvZTE8Mb0jqmYnw5xVSZsktoqEL0HCBkYJKPTmEQTRbFtCnVppYSvo8kg4D35AvAm8s7d3jiFOQpUrzj8VMpiSUpKLUdDeNbsMrgmPHYHEpnWHOv3JH.pdf",
        "attachable_id": 8,
        "attachable_type": "order"
      },
      {
        "id": 7,
        "created_at": "2022-10-05T00:41:41.000000Z",
        "updated_at": "2022-10-05T00:41:41.000000Z",
        "path": "attachments/CjWRncHiqBqpqLeLZfns5YzCMJI9ZObdupgXFhkO5cuUTW9uVQmSMv5wti4an1SfXzFmb8bpy7ESVR2NqlbKGZloNx3OLaw8lpY8xnzdnOeGTMaVuUpO0ymB.pdf",
        "name": "Batch Shipping Labels",
        "url": "http://admin.prepbusiness.com/storage/attachments/CjWRncHiqBqpqLeLZfns5YzCMJI9ZObdupgXFhkO5cuUTW9uVQmSMv5wti4an1SfXzFmb8bpy7ESVR2NqlbKGZloNx3OLaw8lpY8xnzdnOeGTMaVuUpO0ymB.pdf",
        "attachable_id": 8,
        "attachable_type": "order"
      }
    ]
  }
}
Upload Shipping Label
Add a shipping label to an order. This will not add a tracking number to the order and mark it as shipped. This must be done in a separate call.

POST
/orders/{ORDER_ID}/uploadShippingLabel
Parameter	Type	Examples	Description
file
Required
file	Shipping Label.pdf	A file containing the shipping labels for the order. The file can be a PDF, PNG, or JPG.
Example Response
{}
Mark as Shipped
Mark an order as shipped and add a tracking number. This will send the tracking number to the marketplace and mark the order as shipped there.

POST
/orders/{ORDER_ID}/markAsShipped
Parameter	Type	Examples	Description
carrier
Required
string	fedex	The carrier that was used to ship the order. Valid values: fedex, ups, usps, shippo, canada_post, dhl_express, ontrac, other
tracking_number
Required
string	1Z12345E0291980793	The tracking number for the shipment. This is required if the carrier is set.
Example Response
{
  "message": "Order marked as shipped"
}

### Services
Index
Get a list of all services offered at your warehouse

GET
/services
Example Response
{
  "services": [
    {
      "id": 1,
      "created_at": "2024-05-09T13:22:14.000000Z",
      "updated_at": "2024-05-09T13:22:14.000000Z",
      "name": "Extra Poly Bags (1.5mm)",
      "type": "outbound_shipment_item",
      "unit": "bag",
      "when_to_charge": "attached",
      "charge": "0.1500",
      "advanced_options": null,
      "service_provider_id": 1,
      "price_records": [],
      "archived_at": null,
      "deleted_at": null
    },
    {
      "id": 2,
      "created_at": "2024-05-09T13:22:14.000000Z",
      "updated_at": "2024-05-09T13:22:14.000000Z",
      "name": "Thick Poly Bags (3mm)",
      "type": "outbound_shipment_item",
      "unit": "bag",
      "when_to_charge": "attached",
      "charge": "0.2500",
      "advanced_options": null,
      "service_provider_id": 1,
      "price_records": [],
      "archived_at": null,
      "deleted_at": null
    }
  ]
}

### Warehouses
Making calls to the warehouses API

Warehouses
Index
Get a list of all warehouses

GET
/warehouses
Example Response
{
  "data": [
    {
      "id": 1,
      "uuid": "0197e188-5d70-8010-bf60-252ed9687632",
      "name": "AL Warehouse",
      "service_provider_id": 60983,
      "default_address": {
        "id": 1,
        "warehouse_id": 1,
        "address_line_1": "1300 Montgomery Highway",
        "address_line_2": "Suite 368",
        "address_line_3": null,
        "city": "Vestavia Hills",
        "state_province": "AL",
        "postal_code": "35216-5112",
        "country_code": "US",
        "phone_number": "2312312312",
        "is_residential": false
      },
      "addresses": [
        {
          "id": 1,
          "warehouse_id": 1,
          "address_line_1": "1300 Montgomery Highway",
          "address_line_2": "Suite 368",
          "address_line_3": null,
          "city": "Vestavia Hills",
          "state_province": "AL",
          "postal_code": "35216-5112",
          "country_code": "US",
          "phone_number": "2312312312",
          "is_residential": false
        }
      ]
    }
  ]
}

### Webhooks

Webhook Types
See a list of the available webhook types and their format

A list of the available webhook types and their format:

Orders
Order Created
Create / Update Parameter: {"order": {"created": true}}

Example Webhook
{
  "customer_id": 537,
  "billing_address_id": 2065,
  "shipping_address_id": 2065,
  "order_id": "AGC-738647-03",
  "channel_id": 1629,
  "channel_order_id": "CYP-490698-18",
  "order_date": "2024-03-10T08:38:19.007284Z",
  "ship_by": "2024-03-12T08:38:19.007304Z",
  "arrive_by": "2024-03-14T08:38:19.007313Z",
  "status": "pending",
  "warehouse_notes": "Distinctio autem aspernatur eos adipisci.",
  "gift_note": "Cupiditate eaque dolorem molestias quibusdam repudiandae quo.",
  "shipping_method_preference": "exercitationem",
  "currency": "USD",
  "updated_at": "2024-03-11T08:38:19.000000Z",
  "created_at": "2024-03-11T08:38:19.000000Z",
  "id": 488,
  "customer": {
    "id": 537,
    "created_at": "2024-03-11T08:38:19.000000Z",
    "updated_at": "2024-03-11T08:38:19.000000Z",
    "name": "Roob, Wehner and Torphy",
    "merchant_id": 551285524,
    "channel_id": 1628,
    "default_address_id": 2064,
    "email": "jerald92@gmail.com",
    "phone_number": "458-679-9566",
    "email_hash": "7d61f93cbf95ffa48cfaa72ecba5b610f5f582e86722718a94006199662a8628",
    "name_address_hash": "e864eebd6dc65ebf4b5052817b2b84bcefcb4bc6ab821be047a1a788b606cc39"
  },
  "order_items": []
}
Order Shipped
Create / Update Parameter: {"order": {"shipped": true}}

Example Webhook
{
  "type": "order.shipped",
  "data": {
    "customer_id": 224,
    "billing_address_id": 361,
    "shipping_address_id": 361,
    "order_id": "AFR-958508-66",
    "channel_id": 1,
    "channel_order_id": "CNJ-136687-53",
    "order_date": "2022-03-26T08:55:05.084682Z",
    "ship_by": "2022-03-31T08:55:05.084718Z",
    "arrive_by": "2022-04-02T08:55:05.084736Z",
    "status": "shipped",
    "warehouse_notes": "Quia qui ad amet quis dolorem inventore facere.",
    "gift_note": "Sed consequatur quia repellat minus soluta animi voluptas est.",
    "shipping_method_preference": "hic",
    "updated_at": "2022-03-29T08:55:05.000000Z",
    "created_at": "2022-03-29T08:55:05.000000Z",
    "id": 135,
    "customer": {
      "id": 224,
      "created_at": "2022-03-29T08:55:05.000000Z",
      "updated_at": "2022-03-29T08:55:05.000000Z",
      "name": "Maggio-Gerhold",
      "merchant_id": 2,
      "channel_id": 1,
      "default_address_id": 360,
      "email": "jordy.boyle@muller.com",
      "phone_number": "1-878-502-0477",
      "email_hash": "4af94b3150bccfac988f8b33a2714dad2a1398cc7102ba03dd8cb27b2ab8e474",
      "name_address_hash": "6dc4477beef869f8b3c693f9f13ca11a83006ad55ee729e8b146b3fd53b4236c"
    },
    "packages": [
      {
        "id": 39,
        "created_at": "2022-03-29T08:55:05.000000Z",
        "updated_at": "2022-03-29T08:55:05.000000Z",
        "order_id": 135,
        "shipped_at": "2022-03-26T18:32:03.000000Z",
        "arrived_at": null,
        "lpn": "1d7fefcb-bc82-3417-9d63-77282d95b829",
        "tracking_numbers": [
          {
            "id": 189,
            "created_at": "2022-03-29T08:55:05.000000Z",
            "updated_at": "2022-03-29T08:55:05.000000Z",
            "trackable_type": "AppModules\\Orders\\Data\\Package\\Package",
            "trackable_id": 39,
            "number": "1X2143985021669124378",
            "carrier": "ups",
            "eta": null,
            "history": null,
            "delivered_at": null,
            "url": null
          }
        ]
      },
      {
        "id": 40,
        "created_at": "2022-03-29T08:55:05.000000Z",
        "updated_at": "2022-03-29T08:55:05.000000Z",
        "order_id": 135,
        "shipped_at": "2022-03-28T23:01:01.000000Z",
        "arrived_at": null,
        "lpn": "5c35047e-157b-38e3-98bc-8f459fe6393b",
        "tracking_numbers": [
          {
            "id": 190,
            "created_at": "2022-03-29T08:55:05.000000Z",
            "updated_at": "2022-03-29T08:55:05.000000Z",
            "trackable_type": "AppModules\\Orders\\Data\\Package\\Package",
            "trackable_id": 40,
            "number": "1X21439850109124378",
            "carrier": "ups",
            "eta": null,
            "history": null,
            "delivered_at": null,
            "url": null
          }
        ]
      }
    ]
  }
}
Billing
Invoice Created
Note: The invoice created webhook is currently only available for service providers

Create / Update Parameter: {"invoice": {"created": true}}

Example Webhook
{
  "type": "invoice.created",
  "data": {
    "id": 18,
    "created_at": "2022-03-28 06:48:37",
    "charger_type": "company",
    "charger_id": 1,
    "chargee_type": "merchant",
    "chargee_id": 2,
    "stripe_invoice_id": null,
    "stripe_invoice_status": null,
    "description": null,
    "status": "Draft",
    "voided_at": "",
    "finalized_at": "",
    "currency": "BIF",
    "total": 0,
    "is_creating_on_stripe": false,
    "charges": []
  }
}
Tracking
Tracking Updated
Tracking will be updated for tracking numbers related to orders and inbound shipments.

Create / Update Parameter: {"transportation_tracking": {"data_updated": true}}

Example Webhook
{
  "type": "transportation_tracking.data_updated",
  "data": {
    "id": 703,
    "status": "transit",
    "number": "1T5JQIE6RH68U2B5GWT0",
    "carrier": "usps",
    "service_level": "usps__library_mail",
    "eta": "2022-10-01T16:36:01-04:00",
    "transit_at": "2022-09-28T16:36:01-04:00",
    "delivered_at": null,
    "returned_at": null,
    "failed_at": null,
    "package_identifier": "pkg_9wYJDWyd3R3X1ar",
    "tracking_url": "https://tools.usps.com/go/TrackConfirmAction_input?qtc_tLabels1=1T5JQIE6RH68U2B5GWT0"
  }
}
© 2026 PrepBusiness. All rights reserved.



### Adjustments
Store
Create a new adjustment.

POST
/adjustment
Parameter	Type	Examples	Description
item_id
Required
integer	22	ID of the item you are creating an adjustment for.
warehouse_id
Required
integer	5	ID of the warehouse you are creating the adjustment in.
quantity
Required
integer	-4	The amount you are adjusting by. This can be a negative or positive number.
reason
Required
string	lost	One of the following valid reasons: lost, found, damaged, other.
notes
Optional
text	Missing in warehouse	Optional notes to explain the reason for the adjustment.
Example Response
{
  "message": "Adjustment added",
  "adjustment": {
    "reason": "lost",
    "updated_at": "2021-05-20T07:54:15.000000Z",
    "created_at": "2021-05-20T07:54:15.000000Z",
    "id": 1
  }
}

### Merchants
Index
Get a list of all your merchants.

GET
/merchants
Example Response
{
  "data": {
    "id": 1,
    "name": "Stanton-Koss",
    "notes": null,
    "primaryEmail": "larue02@example.com",
    "billingCycle": "monthly",
    "perItemAdjustment": 0,
    "notificationSettings": [],
    "hasDefaultPaymentMethod": false,
    "photoUrl": "https://www.gravatar.com/avatar/535fd4167ef08cf2e374c49e3db455f2.jpg?s=200&d=mm",
    "stripeCustomerId": "cus_L2D4CJqNHhSbjh",
    "enabled": true,
    "isOrdersEnabled": false,
    "pmLastFour": null,
    "billingAddress": null,
    "billingAddressLine2": null,
    "billingCity": null,
    "billingState": null,
    "billingZip": null
  }
}
Store
Create a new merchant account.

POST
/merchants
Parameter	Type	Examples	Description
name
Required
string	Test	The name of the merchant.
primary_email
Required
string	test@test.com	The primary email address for the merchant.
Example Response
{
  "message": "Merchant created",
  "merchant": {
    "id": 35423,
    "name": "Test",
    "notes": null,
    "primaryEmail": "test@test.com",
    "billingCycle": "monthly",
    "billingCycleDay": 3,
    "perItemAdjustment": 0,
    "photoUrl": "https://www.gravatar.com/avatar/b642b4217b34b1e8d3bd915fc65c4452.jpg?s=200&d=mm",
    "enabled": true,
    "isOrdersEnabled": false,
    "isAmazonShipmentsEnabled": true
  }
}

### User Invitations
Store
Send an invitation to a user to join a merchant account.

POST
/users/invitations/merchant
Parameter	Type	Examples	Description
email
Required
string	test@test.com	The email address to send the invitation to.
merchant_id
Required
integer	35423	The ID of the merchant to invite the user to.
role
Required
string	owner	The role to assign to the user (e.g., owner).
Example Response
{
  "message": "An invitation to join this merchant has been sent."
}### PrepBusiness Logo
API Documentation
General API

Getting Started
Authentication
Merchant Header
Pagination
Search Language

Channels
Listings
Charges
Invoices
Inventory

Inbound Shipments

Outbound Shipments
Items
FBA Plans
Orders
Services
Warehouses

Webhooks
Types
Service Provider API
Adjustments
Merchants
User Invitations
Inbound Shipments
Making calls to the inbound shipments API

Index
Get a list of all inbound shipments, using Pagination.

GET
/shipments/inbound
Example Response
{
  "current_page": 1,
  "data": [
    {
      "id": 39,
      "created_at": "2022-03-26T10:23:55.000000Z",
      "updated_at": "2022-03-28T12:52:00.000000Z",
      "merchant_id": 2,
      "name": "Crooks, Reilly and Predovic",
      "notes": "Ipsam et quaerat voluptates iure quae. Dolorum quasi ipsum saepe est sunt exercitationem et. Maiores eum ea officia quas. Autem dolores non delectus.",
      "status": "shipped",
      "warehouse_id": 1,
      "received_at": null,
      "internal_notes": null,
      "archived_at": null,
      "expected_quantity": 680,
      "sku_count": 7,
      "actual_quantity": 0,
      "unsellable_quantity": 4,
      "received_quantity": 4,
      "reference_id": "INSH-032622-39",
      "searchable_identifiers": "B01N1KM25E,X00FK2YTUF,0751765057210"
    }
  ],
  "first_page_url": "http://dashboard.domain.com/api/shipments/inbound?page=1",
  "from": 1,
  "last_page": 2,
  "last_page_url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
  "links": [
    {
      "url": null,
      "label": "&laquo; Previous",
      "active": false
    },
    {
      "url": "http://dashboard.domain.com/api/shipments/inbound?page=1",
      "label": "1",
      "active": true
    },
    {
      "url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
      "label": "2",
      "active": false
    },
    {
      "url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
      "label": "Next &raquo;",
      "active": false
    }
  ],
  "next_page_url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
  "path": "http://dashboard.domain.com/api/shipments/inbound",
  "per_page": 20,
  "prev_page_url": null,
  "to": 20,
  "total": 30
}
Index (Archived Shipments)
Get a list of all archived inbound shipments, using Pagination.

GET
/shipments/inbound/archived
Example Response
{
  "current_page": 1,
  "data": [
    {
      "id": 39,
      "created_at": "2022-03-26T10:23:55.000000Z",
      "updated_at": "2022-03-28T12:52:00.000000Z",
      "merchant_id": 2,
      "name": "Crooks, Reilly and Predovic",
      "notes": "Ipsam et quaerat voluptates iure quae. Dolorum quasi ipsum saepe est sunt exercitationem et. Maiores eum ea officia quas. Autem dolores non delectus.",
      "status": "shipped",
      "warehouse_id": 1,
      "received_at": null,
      "internal_notes": null,
      "archived_at": null,
      "expected_quantity": 680,
      "sku_count": 7,
      "actual_quantity": 0,
      "unsellable_quantity": 4,
      "received_quantity": 4,
      "reference_id": "INSH-032622-39",
      "searchable_identifiers": "B01N1KM25E,X00FK2YTUF,0751765057210"
    }
  ],
  "first_page_url": "http://dashboard.domain.com/api/shipments/inbound?page=1",
  "from": 1,
  "last_page": 2,
  "last_page_url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
  "links": [
    {
      "url": null,
      "label": "&laquo; Previous",
      "active": false
    },
    {
      "url": "http://dashboard.domain.com/api/shipments/inbound?page=1",
      "label": "1",
      "active": true
    },
    {
      "url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
      "label": "2",
      "active": false
    },
    {
      "url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
      "label": "Next &raquo;",
      "active": false
    }
  ],
  "next_page_url": "http://dashboard.domain.com/api/shipments/inbound?page=2",
  "path": "http://dashboard.domain.com/api/shipments/inbound",
  "per_page": 20,
  "prev_page_url": null,
  "to": 20,
  "total": 30
}
Show
Retrieve a specific shipment

GET
/shipments/inbound/{SHIPMENT_ID}
Example Response
{
  "shipment": {
    "id": 19,
    "created_at": "2024-01-26T14:51:01.000000Z",
    "updated_at": "2024-01-29T07:18:52.000000Z",
    "merchant_id": 1,
    "name": "Binary Burst 12",
    "notes": "Validate shipment contents against packing list to ensure accuracy.",
    "warehouse_id": 1,
    "received_at": null,
    "internal_notes": null,
    "archived_at": null,
    "shipped_at": "2024-01-26T14:51:01.000000Z",
    "checked_in_at": null,
    "deleted_at": null,
    "currency": "USD",
    "eta": "2024-01-23 09:51:01",
    "expected_quantity": 310,
    "sku_count": 5,
    "shipment_id": null,
    "actual_quantity": 0,
    "unsellable_quantity": 0,
    "received_quantity": 0,
    "reference_id": "INSH-012624-19",
    "status": "shipped",
    "tracking_numbers": [
      {
        "status": "unknown",
        "number": "4D6BRJR59XI1Y1771X0M",
        "carrier": "shippo",
        "service_level": null,
        "eta": null,
        "transit_at": null,
        "delivered_at": null,
        "returned_at": null,
        "failed_at": null,
        "package_identifier": null,
        "tracking_url": "https://t.17track.net/en#nums=4D6BRJR59XI1Y1771X0M",
        "id": 43
      }
    ],
    "attachments": [],
    "service_lines": [],
    "warehouse": {
      "id": 1,
      "uuid": "0197e188-5d70-8010-bf60-252ed9687632",
      "name": "NY Warehouse",
      "service_provider_id": 1,
      "default_address_id": 1,
      "deletable": false,
      "default_address": {
        "id": 1,
        "created_at": "2024-01-23T14:50:59.000000Z",
        "updated_at": "2024-01-23T14:50:59.000000Z",
        "warehouse_id": 1,
        "address_line_1": "1000 State Route 36",
        "address_line_2": "Suite 370",
        "address_line_3": null,
        "city": "Hornell",
        "state_province": "NY",
        "country_code": "US",
        "postal_code": "14843-2651",
        "phone_number": null,
        "is_residential": false
      }
    },
    "tags": []
  }
}
Create
Create a new inbound shipment

POST
/shipments/inbound
Parameter	Type	Examples	Description
notes
Optional
string	Inventore iusto facilis aperiam modi est.	Shipment notes
name
Required
string	Walmart Oct 26	The name of the shipment
warehouse_id
Required
integer	12	The ID of the warehouse that you are sending the shipment from.
Example Response
{
  "message": "Shipment created",
  "shipment_id": "22"
}
Update
Update a shipment name and notes

PUT
/shipments/inbound/{SHIPMENT_ID}
Parameter	Type	Examples	Description
notes
Optional
string	Inventore iusto facilis aperiam modi est.	Shipment notes
internal_notes
Optional
string	Inventore iusto facilis aperiam modi est.	Warehouse / staff notes
name
Required
string	Walmart Oct 26	The name of the shipment
Example Response
{
  "message": "Shipment updates saved",
  "shipment": {
    "id": 46,
    "created_at": "2021-10-19T07:48:05.000000Z",
    "updated_at": "2021-10-26T17:29:18.000000Z",
    "merchant_id": 2,
    "name": "Lindgren-Cormier",
    "notes": "Inventore iusto facilis aperiam modi est. Aut id quasi numquam consectetur. Explicabo et officia minus consequatur quia sapiente doloribus. a",
    "status": "shipped",
    "warehouse_id": 1,
    "received_at": null,
    "internal_notes": null
  }
}
Submit
Add tracking numbers to a shipment and change the status to shipped

POST
/shipments/inbound/{SHIPMENT_ID}/submit
Parameter	Type	Examples	Description
tracking_numbers
Required
array<string>	[9405500205903080427328]	An array of alphanumeric strings. Required unless carrier is set to no_tracking
carrier
Optional
string	usps	Valid values: canada_post, dhl_express, fedex, usps,ups,shippo,no_tracking,other
Example Response
{
  "message": "Shipment submitted"
}
Receive
Change the status of the shipment to received. No parameters are required.

POST
/shipments/inbound/{SHIPMENT_ID}/receive
Example Response
{
  "message": "Shipment received"
}
Batch Archive
Archive one or more shipments.

POST
/shipments/inbound/batch/archive
Parameter	Type	Examples	Description
shipment_ids
Required
array	See shipment_ids.* parameters	An array of shipment IDS
shipment_ids.*
Optional
int	21	The ID of the shipment
Example Response
{
  "message": "Shipments archived"
}
© 2026 PrepBusiness. All rights reserved.

### PrepBusiness Logo
API Documentation
General API

Getting Started
Authentication
Merchant Header
Pagination
Search Language

Channels
Listings
Charges
Invoices
Inventory

Inbound Shipments
Items

Outbound Shipments
Items
FBA Plans
Orders
Services
Warehouses

Webhooks
Types
Service Provider API
Adjustments
Merchants
User Invitations
