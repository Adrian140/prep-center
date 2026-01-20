# Qogita API

Notă pentru integrarea cu Qogita. Fișierul va strânge detalii despre autentificare, endpoint-uri folosite și pașii de implementare.

## Bază API
- URL: `https://api.qogita.com`
- Versiune documentație: v1 (menționat în UI-ul docs)
- Autentificare: Bearer token (pare necesar pe toate rutele); există endpoint-uri de login/refresh pentru tokenuri.

## Resurse
- Link documentație oficială: TODO (adaugă URL-ul corect după ce îl confirmăm).
- Dashboard Qogita / chei API: TODO.

## Configurație și secrete
- Variabile propuse:
  - `QOGITA_API_KEY` – cheia API.
  - `QOGITA_BASE_URL` – baza (ex. `https://api.qogita.com`, confirmăm).
- Unde stocăm secretele:
  - Local: `.env.local` (nu se commite).
  - Deploy: setări de mediu (ex. Supabase functions / Vercel) – de completat după ce stabilim fluxul.

## Endpoints vizate (de validat)
- Listare/stoc produse.
- Prețuri / disponibilitate.
- Creare comandă.
- Webhook-uri pentru actualizări de status.
- Categorii (listare, detalii).

## Considerații de integrare
- Rate limiting și retry/backoff: TODO (după ce aflăm limitele).
- Idempotency pentru comenzi: TODO (verificăm suportul).
- Logging/monitoring: TODO.
- Mapping de câmpuri (SKU, EAN, cantități, stări): TODO.

## Pașii următori
- [ ] Confirmă URL-ul de bază și versiunea API.
- [ ] Generează/recuperează `QOGITA_API_KEY` și setează-l local + în env-urile de deploy.
- [ ] Notează endpoint-urile exacte cu exemple de request/response.
- [ ] Scrie un wrapper minimal (TypeScript) pentru autentificare + un call de healthcheck/smoke.
- [ ] Definește zona din cod unde integrăm (ex. supabase/functions sau backend API) și adaugă test rapid.
- [ ] Documentează modul de testare (curl/Postman + test automat).

## Notițe din documentația Qogita (extras vizual)

### Categorii
- Endpoint: `GET https://api.qogita.com/categories/`
- Query params: `page`, `size`, `slug` (array, multiple valori separate de virgulă).
- Auth: Bearer token.
- Response: paginat (200); 404 dacă nu există.
- Endpoint detalii: `GET https://api.qogita.com/categories/{qid_or_slug}/` (ne detaliem payload-ul când avem acces complet la schema).

### Alte secțiuni vizibile în docs (fără detaliere încă)
- addresses, auth, brands, carts, checkouts, orders, variants, watchlist.
- Trebuie extras payload-urile + status enums pentru fiecare înainte de implementare.


### /orders/
curl --request GET \
     --url https://api.qogita.com/orders/ \
     --header 'accept: application/json'
Get a paginated list of orders.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
buyer_order_status
array of strings
Order's current status for order level tracking.


ADD string
due_before_after
date-time
The latest payment date before the order is considered overdue.

due_before_before
date-time
The latest payment date before the order is considered overdue.

fid
string
Order's friendly id (i.e., fid).

order
string
Which field to use when ordering the results.

page
integer
A page number within the paginated result set.

search
string
A search term.

size
integer
Number of results to return per page.

status
array of strings
Order's current status.


ADD string
Responses

200
404
No response body

Updated about 2 years ago

### /orders/{qid}/
curl --request GET \
     --url https://api.qogita.com/orders/qid/ \
     --header 'accept: application/json'
Retrieve the details a single order from its qid.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
uuid
required
Query Params
format
string
enum

Allowed:

json

xlsx
Responses

200
404
No response body

### /orders/{qid}/lines/
curl --request GET \
     --url https://api.qogita.com/orders/qid/lines/ \
     --header 'accept: application/json'
get
https://api.qogita.com/orders/{qid}/lines/

Get a paginated list of order lines

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
uuid
required
Query Params
gtin
string
Variant's gtin.

name
string
Variant's name.

order
string
Which field to use when ordering the results.

page
integer
A page number within the paginated result set.

size
integer
Number of results to return per page.

Responses

200
404
No response body

### /orders/{qid}/sales/
curl --request GET \
     --url https://api.qogita.com/orders/qid/sales/ \
     --header 'accept: application/json'
get
https://api.qogita.com/orders/{qid}/sales/

Get a paginated list of orders.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
uuid
required
Query Params
gtin
string
Variant's gtin.

name
string
Variant's name.

order
string
Which field to use when ordering the results.

page
integer
A page number within the paginated result set.

size
integer
Number of results to return per page.

status
array of strings
Filter sales by status


ADD string
Responses

200
404
No response body

Updated about 2 years ago

/orders/{qid}/lines/
variants
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request GET \
2
     --url https://api.qogita.com/orders/qid/sales/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

### /addresses/
curl --request GET \
     --url https://api.qogita.com/addresses/ \
     --header 'accept: application/json'
Get a paginated list of addresses.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
address_line_one
string
Address line one.

address_line_two
string
Address line two (not required).

city
string
Address city.

country
array of strings
Address country code.


ADD string
order
string
Which field to use when ordering the results.

page
integer
A page number within the paginated result set.

size
integer
Number of results to return per page.

usage_types
string
ENUM fields describing how an address should be used.

zip_code
string
Address zip code.

### /addresses/{qid}/
curl --request GET \
     --url https://api.qogita.com/addresses/qid/ \
     --header 'accept: application/json'
get
https://api.qogita.com/addresses/{qid}/

Get an address from its qid.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
uuid
required
Responses

200
404
No response body

### /auth/login/
curl --request POST \
     --url https://api.qogita.com/auth/login/ \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
post
https://api.qogita.com/auth/login/

Issue a new pair of (1) refresh and (2) access tokens.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Body Params
email
string
required
length ≥ 1
The user's email address.

password
string
required
length ≥ 1
The user's password.

Responses

200
400
No response body

401
No response body


429
Updated about 2 years ago

/addresses/{qid}/
/auth/refresh/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request POST \
2
     --url https://api.qogita.com/auth/login/ \
3
     --header 'accept: application/json' \
4
     --header 'content-type: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

### /auth/refresh/
curl --request POST \
     --url https://api.qogita.com/auth/refresh/ \
     --header 'accept: application/json'
post
https://api.qogita.com/auth/refresh/

Rotate the current refresh token (and cookie)
and issue a new access token.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Responses

200
400
No response body

401
No response body


42
### /brands/
curl --request GET \
     --url https://api.qogita.com/brands/ \
     --header 'accept: application/json'
get
https://api.qogita.com/brands/

Get a paginated list of brands.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
order
string
Which field to use when ordering the results.

page
integer
A page number within the paginated result set.

premium
boolean
Filter for premium brands.


size
integer
Number of results to return per page.

slug
array of strings
Multiple values may be separated by commas.


ADD string
Responses

200
404
No response body

### /brands/{qid}/
curl --request GET \
     --url https://api.qogita.com/brands/qid/ \
     --header 'accept: application/json'
get
https://api.qogita.com/brands/{qid}/

Retrieve the details a single brand from its qid.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
uuid
required
Responses

200
404
No response body

### /brands/{slug}/
curl --request GET \
     --url https://api.qogita.com/brands/slug/ \
     --header 'accept: application/json'
get
https://api.qogita.com/brands/{slug}/

Retrieve the details a single brand from its slug.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
slug
string
required
Responses

200
404
No response body

### /brands/{slug}/recommendations/
curl --request GET \
     --url https://api.qogita.com/brands/slug/recommendations/ \
     --header 'accept: application/json'
get
https://api.qogita.com/brands/{slug}/recommendations/

Retrieve the details a single brand from its slug.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
slug
string
required
Responses

200
404
No response body

### /carts/
curl --request GET \
     --url https://api.qogita.com/carts/ \
     --header 'accept: application/json'
get
https://api.qogita.com/carts/

Get a paginated list of carts.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
page
integer
A page number within the paginated result set.

size
integer
Number of results to return per page.

Responses

200
404
No response body

### /carts/{cart_qid}/lines/
curl --request GET \
     --url https://api.qogita.com/carts/cart_qid/lines/ \
     --header 'accept: application/json'

get
https://api.qogita.com/carts/{cart_qid}/lines/

Get a paginated list of cart lines.
Use "active" for cart_qid to list the lines of the active cart.

### /carts/{cart_qid}/lines/
curl --request POST \
     --url https://api.qogita.com/carts/cart_qid/lines/ \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
post
https://api.qogita.com/carts/{cart_qid}/lines/

Create a new cart line.
Use "active" for cart_qid to create a cart line in the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
cart_qid
string
required
Body Params
quantity
integer
required
1 to 2147483647
Variant's quantity.

gtin
string
length between 1 and 300
The GTIN of the variant.

dealId
integer | null
Deal linked to this cartline.

offerQid
uuid
QID for the offer of this line.

Response

201

### /carts/{cart_qid}/lines/{qid}/
curl --request PATCH \
     --url https://api.qogita.com/carts/cart_qid/lines/qid/ \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
patch
https://api.qogita.com/carts/{cart_qid}/lines/{qid}/

Partially update cart line using its qid.
Use "active" for cart_qid to patch a line in the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
cart_qid
string
required
qid
uuid
required
Body Params
quantity
integer
1 to 2147483647
Variant's quantity.

Responses

200
404
No response body

### /carts/{cart_qid}/lines/{qid}/
curl --request DELETE \
     --url https://api.qogita.com/carts/cart_qid/lines/qid/
delete
https://api.qogita.com/carts/{cart_qid}/lines/{qid}/

Delete cart line.
Use "active" for cart_qid to delete a line in the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
cart_qid
string
required
qid
uuid
required
Responses
204
No response body

404
No response body

### /carts/{qid}/

curl --request GET \
     --url https://api.qogita.com/carts/qid/ \
     --header 'accept: application/json'
get
https://api.qogita.com/carts/{qid}/

Retrieve the details of a single cart from its qid.
Use "active" instead of qid in the URL to retrieve your active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
string
required
Query Params
format
string
enum

Allowed:

json

xlsx
Responses

200
404
No response body

### /carts/{qid}/allocation-lines/
get
https://api.qogita.com/carts/{qid}/allocation-lines/

Get a paginated list of the lines changed by the optimizer.
Use "active" for qid to list the allocation lines of the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
string
required
Query Params
allocation_status
array of strings
Status of allocation for this cartline.


ADD string
page
integer
A page number within the paginated result set.

size
integer
Number of results to return per page.

sort
string
enum
How to sort the results.


Allowed:

-created_at

allocation_status

created_at
Responses

200
404
No response body

Updated about 1 year ago

/carts/{qid}/
/carts/{qid}/allocation-summary/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request GET \
2
     --url https://api.qogita.com/carts/qid/allocation-lines/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

200

### /carts/{qid}/allocation-summary/
get
https://api.qogita.com/carts/{qid}/allocation-summary/

Retrieve the summary of optimiser changes.
Use "active" instead of qid to get the summary for the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
string
required
Responses

200

400
404
No response body

Updated about 1 year ago

/carts/{qid}/allocation-lines/
/carts/{qid}/empty/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request GET \
2
     --url https://api.qogita.com/carts/qid/allocation-summary/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

200

400

### /carts/{qid}/empty/
post
https://api.qogita.com/carts/{qid}/empty/

Empties the cart by deleting its cartlines.
Use "active" instead of qid to empty the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
string
required
Responses

200

403

404
Updated about 1 year ago

/carts/{qid}/allocation-summary/
/carts/{qid}/optimize/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request POST \
2
     --url https://api.qogita.com/carts/qid/empty/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

200

403

### /carts/{qid}/optimize/
post
https://api.qogita.com/carts/{qid}/optimize/

Optimize a cart. This will allocate sellers whilst ensuring overall cost is minimized.
At the end it will return a checkout object and the cart will stay the same.
Use "active" instead of qid to optimize the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
qid
string
required
Body Params
optimizerStrategy
string
enum
The strategy used to optimize this cart.


Allowed:

STANDARD

FIXED_PRICE

HEADLESS
Responses

200
400
No response body

404
No response body

422
No response body

Updated about 1 year ago

/carts/{qid}/empty/
/carts/{qid}/recommendations/{gtin}/mov-progress/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request POST \
2
     --url https://api.qogita.com/carts/qid/optimize/ \
3
     --header 'accept: application/json' \
4
     --header 'content-type: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

### /carts/{qid}/recommendations/{gtin}/mov-progress/
get
https://api.qogita.com/carts/{qid}/recommendations/{gtin}/mov-progress/


Retrieve the mov progress of a cart line.
Use "active" instead of qid to get the mov progress of a line in the active cart.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
gtin
string
required
qid
string
required
Responses

200

400

403

404
Updated about 1 year ago

/carts/{qid}/optimize/
categories
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request GET \
2
     --url https://api.qogita.com/carts/qid/recommendations/gtin/mov-progress/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

### /watchlist/items/
get
https://api.qogita.com/watchlist/items/

Retrieve a paginated list of user's watchlisted items (variants).

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
are_targets_met
boolean
Filter items that have the price and quantity targets met


format
string
enum

Allowed:

json

xlsx
is_available
boolean
Filter items that are available and in stock


order
array of strings
Ordering


ADD string
page
integer
A page number within the paginated result set.

search
string
A search term.

size
integer
Number of results to return per page.

Responses

200

401
Updated about 2 years ago

/variants/search/download/
/watchlist/items/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request GET \
2
     --url https://api.qogita.com/watchlist/items/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

200

401
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

### /watchlist/items/
post
https://api.qogita.com/watchlist/items/

Add a variant to the user's list of watchlisted items.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
format
string
enum

Allowed:

json

xlsx
Body Params
gtin
string
required
length ≥ 1
Barcode (GTIN, EAN or UPC).

Responses

201

400

401
Updated about 2 years ago

/watchlist/items/
/watchlist/items/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request POST \
2
     --url https://api.qogita.com/watchlist/items/ \
3
     --header 'accept: application/json' \
4
     --header 'content-type: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

201

400

401
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

201

400

401

### /watchlist/items/

delete
https://api.qogita.com/watchlist/items/

Delete all the user's watchlisted items.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Query Params
format
string
enum

Allowed:

json

xlsx
Response
204
No response body

Updated about 2 years ago

/watchlist/items/
/watchlist/items/{gtin}/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request DELETE \
2
     --url https://api.qogita.com/watchlist/items/

Try It!
Response
Click Try It! to start a request and see the response here!

### /watchlist/items/{gtin}/ 
patch
https://api.qogita.com/watchlist/items/{gtin}/

Update the watchlisted item.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
gtin
string
required
Body Params
targetPrice
string | null
Price amount the user is willing to buy the variant for.

targetQuantity
integer | null
Quantity of the variant the user wants to buy.

Responses

200

401

404
Updated about 2 years ago

/watchlist/items/
/watchlist/items/{gtin}/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request PATCH \
2
     --url https://api.qogita.com/watchlist/items/gtin/ \
3
     --header 'accept: application/json' \
4
     --header 'content-type: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json

### /watchlist/items/{gtin}/
delete
https://api.qogita.com/watchlist/items/{gtin}/

Delete a variant from the user's list of watchlisted items.

Recent Requests
Log in to see full request history
Time	Status	User Agent	
Make a request to see history.
0 Requests This Month

Path Params
gtin
string
required
Responses
204
No response body


401

404
Updated about 2 years ago

/watchlist/items/{gtin}/
Did this page help you?
Language

Shell

Node

Ruby

PHP

Python
Credentials
Bearer
token

1
curl --request DELETE \
2
     --url https://api.qogita.com/watchlist/items/gtin/ \
3
     --header 'accept: application/json'

Try It!
Response
Click Try It! to start a request and see the response here! Or choose an example:
application/json


# Qogita Buyer API (Beta)

<aside>
<img src="/icons/warning_lightgray.svg" alt="/icons/warning_lightgray.svg" width="40px" /> This is a **beta API**, still under development, API versioning is not implemented and breaking changes might be introduced without prior notice.
Please refer to this documentation for updates and maintain compatibility.

</aside>

# Introduction

Qogita offers a REST API that provides a streamlined way for your system to integrate with our B2B wholesale trading hub. We connect businesses looking to source Health & Beauty products with a global network of suppliers, offering a vast selection at competitive prices.

Here's what makes our platform unique for buyers:

- **Simplified Sourcing:** We aggregate offers from various sources into a single, unified feed, eliminating the need for buyers to compare prices and offers themselves.
- **Global Reach:** Access a diverse range of products from suppliers worldwide.
- **Seamless Integration:** Integrate your system with our API to leverage our platform functionalities.

This API offers a focused set of endpoints categorized by functionality, enabling developers to integrate features like:

- **Product Browsing & Search:** Discover and explore thousands of Health & Beauty products from various categories and brands.
- **Cart & Watchlist Management:** Add and manage products in your carts and watchlists for future purchases.
- **Order Placement:** Simplified order placement with our platform for an automated buying experience.

This documentation will guide you through getting started, explore common use cases through code snippets, and provide further considerations for successful integration. We also link to our API reference for detailed explanations of each endpoint.

# Getting Started

Before diving into the API and some examples, let's ensure you have everything set up for a successful integration.

## Prerequisites

- **Registered User:** You must be a registered user on [www.qogita.com](https://www.qogita.com). Please note that Qogita is not intended for individual customer accounts, only valid businesses can access our website and our platform.
- **Programming Language & Tools:** Choose a programming language comfortable for you and any necessary libraries/frameworks to interact with the API (i.e. Python and the *requests* library).

## URL & Versioning

This API is still under development, versioning is not implemented yet and breaking changes might be introduced without prior notice.

- **Base URL:** `https://api.qogita.com`
- **Paths:** Paths are appended to the base URL and **should always end with a forward slash**, for example `/auth/login/`.

## Authentication

The `/auth/login/` endpoint is how you get access to our API functionalities. This endpoint uses `POST` requests and requires an `email` and `password` pair in the request body.

<aside>
<img src="/icons/info-alternate_lightgray.svg" alt="/icons/info-alternate_lightgray.svg" width="40px" /> The credentials are the same as those you use to log in to [www.qogita.com](http://www.qogita.com).

</aside>

**Successful login responses** will include:

- **Access Token:** A unique token used for authorization in subsequent API calls. You’ll also get an access expiration timestamp and a signature.
- **User Details:** Information about the authenticated user, including user details, business details, etc. (refer to the [API reference](https://www.notion.so/Qogita-Developer-Portal-d2e0a30921d646b19b9468aebe2a03dc?pvs=21) for specific details).

Once you’ve successfully authenticated, you simply need to add your Access Token in the `Authorization` header as `Bearer <token>` on every API call.

## Rate Limiting

To prevent misuse and ensure smooth system performance, some API endpoints have rate limits in place. If you exceed this limit, you'll receive a `429 Too Many Requests` HTTP response code.

This response will also include a `Retry-After` header specifying the number of **seconds** you should wait before retrying requests to that particular endpoint.

# Code Snippets

This section provides practical code examples to help you integrate faster with our API.

These snippets are written in Python and use the popular *requests* library for making API calls.

Each snippet focuses on a specific task, demonstrating how to interact with the API for common functionalities.

By following these examples and referring to the API reference for detailed endpoint specifications, you can effectively build your integrations and leverage the power of our platform.

## Authentication

```python
import requests

# Base URL for Qogita's API.
QOGITA_API_URL = "https://api.qogita.com"

# Login details for user.
QOGITA_EMAIL = "<your email address on qogita.com>"
QOGITA_PASSWORD = "<your password on qogita.com>"

# Authentication request.
response = requests.post(url=f"{QOGITA_API_URL}/auth/login/",
                         json={"email": QOGITA_EMAIL, "password": QOGITA_PASSWORD}).json()

# Retrieve the access token and create the auth header to use in all requests.
access_token = response["accessToken"]
headers = {"Authorization": f"Bearer {access_token}"}

# Retrieve the active Cart identifier so that you can interact with the cart.
cart_qid = response["user"]["activeCartQid"]
```

## Download Catalog

<aside>
⚠️

Rate limit for this endpoint is of 5 requests per 15 minutes.

</aside>

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Request to our catalog download endpoint.
response = requests.get(url=f"{QOGITA_API_URL}/variants/search/download/?"
                            f"&category_name=fragrance" # Filter by category name or URL slug
                            f"&brand_name=Paco Rabanne" # Filter by multiple brand names
                            f"&brand_name=Calvin Klein"
                            f"&stock_availability=in_stock" # Filter by products that are currently in stock
                            f"&cart_allocation_qid=<uuid or supplier-fid>" # Filter by a specific supplier FID (as seen on the product page or the cart) or by the cart allocation qid (uuid)
                            f"&page=1"
                            f"&size=10",
                        headers=headers).content.decode('utf-8')

# Create a CSV reader.
csv_reader = csv.reader(StringIO(response))

# Read the header row first.
headers = next(csv_reader)

# Now read the data rows line by line.
for row in csv_reader:
    print(row)
```

## Searching for Products

<aside>
⚠️

Result set is limited to a maximum of 10,000 records.

For large result sets you should use the `GET variants/search/download/` endpoint which returns all matching products in a CSV file without record limits.

</aside>

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Request to our search endpoint.
response = requests.get(url=f"{QOGITA_API_URL}/search/offers/?"
                            f"&query=perfume+100ml" # Free text query
                            f"&category_name=Cosmetics" # Filter by category name
                            f"&brand_name=Paco Rabanne" # Filter by multiple brand names
                            f"&brand_name=Calvin Klein"
                            f"&stock_availability=in_stock" # Filter by products that are currently in stock
                            f"&cart_allocation_qid=<uuid or supplier-fid>" # Filter by a specific supplier FID (as seen on the product page or the cart) or by the cart allocation qid (uuid)
                            f"&page=1"
                            f"&size=10",
                        headers=headers).json()

for variant in response["results"]:
    print(f"{variant['gtin']} | {variant['name']} | {variant['minPrice']} | {variant['inventory']} | {variant['imageUrl']} | {variant['offerCount']}")
```

## Working with Offers

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Download our catalog as CSV.
# Using this strategy you can get our catalog in one go, without needing to go page by page.

# GET /variants/search/download/
response = requests.get(url=f"{QOGITA_API_URL}/variants/search/download/?"
                            f"&category_name=fragrance" # Filter by category name or URL slug
                            f"&brand_name=Paco Rabanne" # Filter by multiple brand names
                            f"&brand_name=Calvin Klein",
                        headers=headers).content.decode('utf-8')

items = csv.DictReader(StringIO(response))

variants = []

# Go through all products in the catalog and decide which ones to buy.
for item in items:
    gtin = item["GTIN"]
    price = Decimal(item["€ Price inc. shipping"])
    product_fid, product_slug = item["Product URL"].split('/')[-2:]
    
    # If this is a good price, let's consider this product for the next stage.
    if (price < 5):
        variants.append({
            "gtin": gtin,
            "fid": product_fid,
            "slug": product_slug
        })

best_offers = []

# For each of the products we're interested in, let's get their best offer (lowest price).
for variant in variants:

		# GET /variants/{variant_fid}/{variant_slug}/offers/
    best_offer = requests.get(url=f"{QOGITA_API_URL}/variants/{variant['fid']}/{variant['slug']}/offers/",
                        headers=headers).json()["offers"][0]
    
    best_offers.append(best_offer)

incomplete_offers = []

# Let's add to cart all the best offers.
# We'll keep track of the offers for which the inventory doesn't allow us to reach the MOV.
# This is a very naive approach because we're not accounting for multiple best offers being
# from the same supplier.
for offer in best_offers:
    qid = offer["qid"]
    price = Decimal(offer["price"])
    mov = Decimal(offer["mov"])
    inventory = offer["inventory"]
    
    min_qty_for_mov = int((mov / price).quantize(Decimal('1'), rounding=ROUND_UP))
    
    if inventory >= min_qty_for_mov:
        # There's enough inventory available for us to reach the MOV, let's add to cart.
        
        # POST /carts/active/lines/
        response = requests.post(
                        url=f"{QOGITA_API_URL}/carts/active/lines/",
                        json={ "offerQid": qid, "quantity": min_qty_for_mov },
                        headers=headers).json()
    else:
        # There's not enough inventory available for us to reach the MOV.
        # Let's add to cart but also keep track of these.
        
        # POST /carts/active/lines/
        response = requests.post(
                        url=f"{QOGITA_API_URL}/carts/active/lines/",
                        json={ "offerQid": qid, "quantity": inventory },
                        headers=headers).json()
        
        incomplete_offers.append(offer)

# For all the incomplete offers we'll search the supplier inventory.
for offer in incomplete_offers:
    
    supplier_fid = offer["seller"]
    price = Decimal(offer["price"])
    inventory = offer["inventory"]
    mov = Decimal(offer["mov"]) - (price * inventory)
    
    # GET /variants/offers/search/{supplier_fid}/
    response = requests.get(url=f"{QOGITA_API_URL}/variants/offers/search/{supplier_fid}/?category_name=fragrance",
                            headers=headers).json()

    for product in response["results"]:
        
        if product["offerQid"] == offer["qid"]:
            continue
        
        if product["isWellPriced"]:
            # We make use of the isWellPrice flag to decide on which products to add to cart to reach the MOV.        
            price = Decimal(product["price"])
            inventory = product["inventory"]
            min_qty_for_mov = int((mov / price).quantize(Decimal('1'), rounding=ROUND_UP))
            
            # POST /carts/active/lines/
            response = requests.post(
                            url=f"{QOGITA_API_URL}/carts/active/lines/",
                            json={
                                "quantity": min_qty_for_mov,
                                "offerQid": product["offerQid"]
                            },
                            headers=headers).json()

# At any point, if we wish to get the supplier MOV, we can use this function.
def get_mov(supplier_fid):

		# GET /carts/active/allocations/
    response = requests.get(url=f"{QOGITA_API_URL}/carts/active/allocations/",
                        headers=headers).json()
    
    for allocation in response["results"]:
        if allocation["fid"] == supplier_fid:
            return (allocation["mov"], allocation["movCurrency"], allocation["movProgress"])
    return (None, None, None)

```

## Checkout

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Always make sure the checkout is valid and that you're OK to proceed to checkout complete.
# Check if response["errors"] has any error defined.
response = requests.post(url=f"{QOGITA_API_URL}/checkouts/active/validate/",
                        headers=headers).json()

# Retrieve the address identifier that we want to use for shipping and billing at checkout.
response = requests.get(url=f"{QOGITA_API_URL}/addresses/?page=1&size=10",
                        headers=headers).json()

first_address_qid = response["results"][0]["qid"]

# Set the address in the checkout information.
requests.patch(url=f"{QOGITA_API_URL}/checkouts/active/",
               json={"shippingAddressQid": first_address_qid, "billingAddressQid": first_address_qid},
               headers=headers)

# Set the payment method.
# Credit/Debit Card: { "code": "PAY_BY_CARD" }
# Bank Transfer: { "code": "BANK_TRANSFER" }
# Financed (Mondu): { "code": "MONDU", "paymentTerm": "THIRTY_DAYS" } (or SIXTY_DAYS or NINETY_DAYS)
requests.patch(url=f"{QOGITA_API_URL}/checkouts/active/",
               json={ "selectedPaymentMethod": { "code":"PAY_BY_CARD" } },
               headers=headers)

# Complete checkout.
response = requests.post(url=f"{QOGITA_API_URL}/checkouts/active/complete/",
				                headers=headers).json()
```

## Watchlist Items

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Request to the watchlist/items endpoint.
response = requests.get(url=f"{QOGITA_API_URL}/watchlist/items/",
                        headers=headers).json()

for watchlist_item in response["results"]:
    print(
        f"{watchlist_item['gtin']} | {watchlist_item['name']} | {watchlist_item['availableQuantity']} | "
        f"{watchlist_item['targetQuantity']} | {watchlist_item['price']} | {watchlist_item['priceCurrency']} | "
        f"{watchlist_item['targetPrice']} | {watchlist_item['targetPriceCurrency']} | "
        f"{watchlist_item['areTargetsMet']}")
```

## Order History

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Request to the /orders/ endpoint, filtering by PAID and FINANCED orders.
response = requests.get(url=f"{QOGITA_API_URL}/orders/?status=PAID,FINANCED",
                        headers=headers).json()

for order in response["results"]:
    order_placed_at = datetime.fromtimestamp(order['submittedAt'] / 1000).strftime("%Y-%m-%d %H:%M:%S")
    print(f"{order['qid']} | {order['fid']} | {order['status']} | {order['total']} | {order['totalCurrency']} | "
          f"{order_placed_at}")
```

## Order Shipments

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Assume {order_qid} is available from the Order History fetch.

# Request to the /orders/:qid/sales/ endpoint to retrieve the shipments details.
response = requests.get(url=f"{QOGITA_API_URL}/orders/{order_qid}/sales/",
                     headers=headers).json()

suppliers = response["results"]

# Go through each allocated supplier to check the allocated products, requested and
# shipped quantities, as well as retrieve the associated shipment tracking links.
for supplier in suppliers:

    print(f"{supplier['seller']} ({supplier['qty']})")

    print(" ----- Sale Lines ----- ")
    for sale in supplier["salelines"]:
        print(
            f"    {sale['variant']['gtin']} | {sale['variant']['name']} | {sale['quantity']}/{sale['requestedQuantity']} | "
            f"{sale['price']} | {sale['priceCurrency']} | {sale['subtotal']} | {sale['subtotalCurrency']}")

    print(" ----- Shipments ----- ")
    for shipment in supplier["shipments"]:
        print(
            f"    {shipment['code']} | {shipment['url']} | {shipment['carrier']['name']}")
```

## Order Invoices

```python
# Assume auth was successful, and you have headers = { "Authorization": "Bearer <token>" }.

# Assume {order_qid} is available from the Order History fetch.

# Request to the /orders/:qid/ endpoint to retrieve the list of invoices.
order = requests.get(url=f"{QOGITA_API_URL}/orders/{order_qid}/",
                     headers=headers).json()

invoices = order["invoices"]

# Go through each invoice and retrieve its unique id, date and files.
for invoice in invoices:
    print(f"{invoice['fid']} | {invoice['invoicedAt']} | {invoice['excel']} | {invoice['pdf']}")

proforma = order["proformas"]

# Retrieve the proforma in the preferred format.
print(f"{proforma['excel']} | {proforma['pdf']}")
```

# API Reference

To get all the details about the available endpoints, including all request and response shapes, please visit our API reference documentation.

<aside>
<img src="/icons/globe_lightgray.svg" alt="/icons/globe_lightgray.svg" width="40px" /> [**https://qogita.readme.io/**](https://qogita.readme.io/)

</aside>

# More Information

If you've explored this page but still have questions regarding our API, feel free to reach out to us via email at [api@qogita.com](mailto:api@qogita.com).