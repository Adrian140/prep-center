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
