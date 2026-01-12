# Fulfillment Inbound API v2024-03-20

```mermaid
flowchart TD
  S1["Step 1: Create Inbound Plan"]
  R1["Response: inboundPlanId, operationId"]
  S1 |API call: createInboundPlan| R1

  subgraph P["Generate and Confirm Packing Options"]
    S2["Step 2: Generate Packing Options"]
    R2["Response: operationId"]
    S3["Step 3: List Packing Options"]
    R3["Response: packingOptionId, packingGroupId"]
    S4["Step 4: Confirm Packing Option"]
    R4["Response: operationId"]
    S5["Step 5: Set Packing Information"]
    R5["Response: operationId"]

    S2 |API call: generatePackingOptions| R2
    S2  S3
    S3 |API call: listPackingOptions| R3
    S3  S4
    S4 |API call: confirmPackingOption| R4
    S4  S5
    S5 |API call: setPackingInformation| R5
  end

  S1  S2

  subgraph PL["Generate Placement Options"]
    S6["Step 6: Generate Placement Options"]
    R6["Response: operationId"]
    S7["Step 7: List Placement Options"]
    R7["Response: shipmentId, placementOptionId"]

    S6 -->|API call: generatePlacementOptions| R6
    S6 --> S7
    S7 -->|API call: listPlacementOptions| R7
  end

  S5 --> S6

  subgraph T["Generate Transportation Options"]
    S8["Step 8: Generate Transportation Options"]
    R8["Response: operationId"]
    S9["Step 9: List Transportation Options"]
    R9["Response: transportationOptionId"]
    S10["Step 10: Get Shipment"]
    R10["Response: shipment details"]

    S8 -->|API call: generateTransportationOptions| R8
    S8 --> S9
    S9 -->|API call: listTransportationOptions| R9
    S9 --> S10
    S10 -->|API call: getShipment| R10
  end

  S7 --> S8

  subgraph C["Confirm Placement and Transportation Options"]
    S11["Step 11: Confirm Placement Option"]
    R11["Response: operationId"]
    S12["Step 12: Confirm Transportation Options"]
    R12["Response: operationId"]

    S11 -->|API call: confirmPlacementOption| R11
    S11 --> S12
    S12 -->|API call: confirmTransportationOptions| R12
  end

  S10 --> S11

  subgraph L["Get Shipment Details and Labels"]
    S13["Step 13: Get Shipment"]
    R13["Response: shipmentConfirmationId"]
    S14["Step 14: Get Labels"]
    R14["Response: FBA box labels, carrier labels"]

    S13 -->|API call: getShipment| R13
    S13 --> S14
    S14 -->|API call: getLabels| R14
  end

  S12 --> S13
```
### Small parcel delivery to Amazon
Small parcel delivery to Amazon
On this page
Boxes preparation
Guidelines for carriers
Preferred small parcel carriers
Amazon Partnered Carrier programme
Important: For a one-year period starting April 12, 2022, we will provide an average discount of 50% on Amazon Partnered Carrier programme fees for domestic FBA shipments sent to fulfilment centres in Germany, France, Italy and Spain. To learn more about this discount, go to Amazon Partnered Carrier programme promotional discount FAQ.
Important: Failure to comply with Fulfilment by Amazon product preparation requirements, safety requirements and product restrictions may result in the refusal of inventory at Amazon fulfilment centres, disposal or return of inventory, blocking of future shipments to fulfilment centres, or charging for preparation or for non-compliance. Share these requirements with your carrier or vendor to ensure that they fully understand and adhere to these requirements.
The following requirements apply to all small parcel deliveries shipped to Amazon fulfilment centres.

Boxes preparation
All small parcel delivery boxes must have delivery labels.
Indicate the number of box labels that you will need (one per box) and print them using a laser printer. Do not use inkjet printers as barcodes may become not scannable due to the ink smudging or running.
Do not include messaging on shipment labels or other labels applied to boxes.
Box dimensions must not exceed 63.5 cm on any side unless the dimension of a single shippable unit exceeds 63.5 cm in itself.
Each box must weigh no more than 23 kg, unless it contains one single oversized product that exceeds 23 kg. Boxes weighing more than 15 kg must be marked as “Heavy package”, which must be visible from both the top and sides of each heavy weight container. Boxes that weigh more than 23 kg must be broken down into smaller shipment weights.
Place each label on the outside of each box, taking care to ensure that the physical contents of the box match with the box number in the shipping plan.
Position the labels so that they will be easily visible when receiving at the fulfilment centre and do not cross the box seam.
Print the full set of labels. As each label is unique, do not photocopy, reuse or modify it for use on additional boxes.
Shipment labels must not be placed on the seam of the box, where they can be damaged when the box is opened, which makes the barcodes not scannable.
Whenever possible, place shipment labels no closer than 3 cm or 1.25’’ from any natural edge of the box, in such a way that the tape used to seal the box does not cover any barcode or critical information.
Guidelines for carriers
Only professional carriers are allowed to make delivery appointments with Amazon fulfilment centres. Amazon does not allow general public deliveries.
Carriers must adhere to our delivery requirements and safety standards.
All carriers must supply evidence that goods were handed over to the designated Amazon fulfilment centre. Proof is provided by a time stamp for drop-off at Amazon premises and the signature or name of an Amazon employee.
Important: Bear in mind that your shipments to Germany that are assigned to fulfilment centres in Poland or Czechia and not using the Partnered Carrier programme with DHL will be directed to logistic service providers. The addresses will be automatically generated during the shipment creation in Seller Central on your shipping label.
The address of the WRO5 fulfilment centre is the Finsterwalder hub in Halle/Saale:

Finsterwalder Transport und Logistik GmbH
Schieferstraße 16 
06126 Halle/Saale 
To schedule an appointment for a small-parcel shipment with the Finsterwalder hub, your carrier needs to book an appointment at Finsterwalder Booking to avoid waiting times.

The address of the other fulfilment centre in Poland and Czechia is the SLAM hub in Oschatz:

Slam Poland Sp. z o.o.
Am Zeugamt 6
04758 Oschatz 
To schedule an appointment for a small-parcel shipment with the SLAM hub in Oschatz, your carrier needs to book an appointment at SLAM Booking and book a slot to avoid waiting times.

Preferred small parcel carriers
Only professional carriers can book a delivery slot with Amazon hubs. We strongly recommend using one of the preferred parcel carriers listed below. These carriers deliver at regular, pre-arranged times.

You can find below a list of carriers that you can use for small parcel deliveries to Amazon fulfilment centres in the UK.

Carrier	Milton Keynes	Dunfermline	Gourock	Peterborough	Swansea	Doncaster	Rugeley	Hemel Hempstead LTN2	Peterborough UNO-EUKA	Coalville BHX2	Dunstable LTN4	Manchester MAN1	Daventry XUKD
LTN1	EDI4	GLA1	EUK5	CWL1	LBA1	BHX1
Parceline/DPD	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes
DHL	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	
Business Post/UK Mail	Yes	Yes		Yes	Yes	Yes	Yes	Yes	Yes	Yes		Yes	
TNT	Yes			Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	
ParcelForce	Yes	Yes		Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	
FedEx	Yes				Yes	Yes	Yes	Yes	Yes		Yes	Yes	
UPS	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes	Yes
City Link	Yes												
“Yes” means that a standing appointment already exists at the location.

Amazon Partnered Carrier programme
With the Amazon Partnered Carrier programme, you can make small parcel deliveries at discounted rates.

Carriers that provide this service are as follows:

UPS in Germany, France, Italy, Spain, Sweden, Poland, the Netherlands, Belgium, Austria, Denmark, Portugal, Ireland and the Czech Republic

DHL in Germany

Learn more about the Amazon Partnered Carrier programme.

If you are using an Amazon-partnered carrier, you must enter the dimensional data for your small parcel delivery boxes. These dimensions are used to calculate dimensional weight, which can be used to determine fees if the dimensional weight exceeds the actual weight.



### LTL programme eligibility
Amazon Partnered Carrier Programme (PCP) – Pallet deliveries, Less-Than-Truckload (LTL), Full-Truckload (FTL)
On this page
LTL/FTL Partnered Carrier Programme (PCP) – Overview and benefits
LTL programme eligibility
Less than truckload delivery programme benefits
Less than truckload PCP cost calculation – Fees
Booking a shipment with PCP less than truckload in Seller Central
Tracking with PCP less than truckload delivery
Other important programme information
Frequently asked questions
To learn more about shipping small parcels and pallets with the Amazon Partnered Carrier Programme, watch this Seller University video.



LTL/FTL Partnered Carrier Programme (PCP) – Overview and benefits
Important: On 1 January 2021, we updated the workflow for shipments between the UK and the EU using the Amazon Partnered Carrier Programme. For these shipments, you must be customs compliant and prepare documentation for customs clearance. For more information, go to Cross-border shipment workflow: FAQ.
With the Amazon Partnered Carrier Programme (PCP), sellers using Fulfilment by Amazon (FBA) can send eligible shipments to fulfilment centres across Europe at discounted rates. The programme is available for both small parcel deliveries (SPD) and palletised less than truckload delivery/full truckload (LTL/FTL) shipments. This help page will specifically focus on the PCP LTL service.

Before checking if your shipment is eligible for PCP less than truckload delivery, ensure that you have familiarised yourself with the general PCP guidelines that will apply next to the guidelines set below. For the general information about the PCP programme, go to Amazon Partnered Carrier Programme (PCP) – Overview help page.

For more information on the Amazon small parcel delivery service, go to Amazon Partnered Carrier Programme (PCP) – Small parcel deliveries (SPD) help page.

LTL programme eligibility
For your shipment to be eligible to be inbounded with PCP LTL delivery, the following conditions must apply:

Pallet guidelines – Pallets must be non-stackable. Pallet exchange is not offered with the programme. Oversized pallets are not accepted with the programme. Pallet dimensions are not allowed to exceed:
Shipments to the UK: 120 x 100 x 180 cm GMA grade B or higher or CHEP (L x W x H) and a maximum number of 26 pallets per shipment
Shipment to the EU: 120 x 80 x 180 Euro/CHEP (L x W x H) and a maximum number of 33 pallets per shipment
Max. weight for all shipments: 500 kg per pallet
It is now allowed to deliver products in pallets boxes (aka palletainers or bulk boxes) across the entire EU Customer Fulfilment (EU CF) network.
Product guidelines – Dangerous and hazardous goods cannot be sent via PCP LTL even if you are part of the FBA Hazmat programme. Heavy and bulky items can only be sent via PCP LTL if the pallet guidelines above are adhered to.
Postcode guidelines – Your fulfilment centre must be located in UK, Germany, France, Italy, Spain, Netherlands, Poland, Sweden or Czech Republic. Furthermore, the following postcodes cannot be serviced at all by PCP LTL at the moment:
Territory	Postcodes
Germany	18565, 25845, 25846–25847, 25849, 25859, 25863, 25869, 25929–25933, 25938–25942, 25946–25949, 25952–25955, 25961–25970, 25980, 25985–25986, 25988–25990, 25992–25994, 25996–25999, 26465, 26474, 26486, 26548, 26571, 26579, 26757, 27400, 27498, 83209, 83256
Spain	Balears: 07000–07999, Canary Islands: 35000–35999, 38000–38999, Ceuta and Melilla: 51000–52999
France	17410, 17580, 17590, 17630, 17670, 17740, 17880, 17940, 22870, 29242, 29253, 29259, 56360, 56590, 56780, 85330, 85350, Corsica: 20000–20999
United Kingdom	BT1–82, BT92–94, BT99, GY1–9, HS1–9, IM1–9, IV1–28, IV 36, IV40–56, IV63, JE1–4, KA 27–28, KW1–17, PA20–38, PA41–78, PH18–26, PH31–44, PO30–41, TR20–25, ZE1–3
Packaging guidelines – Your shipment must be prepared and packed according to the Fulfilment by Amazon guidelines. For more information, go to Arranging for an LTL or truckload delivery to Amazon.
Fulfilment centre guidelines – Your fulfilment centre must be easily accessible and clearly identifiable with the information provided by you (name of fulfilment centre is clearly visible and communicated correctly to Amazon during booking process). When a forklift is not available, this is communicated to the carrier beforehand. Your fulfilment centre must be available on the day of pick-up between 08:00 and 16:00.
Pick-up guidelines – During collection, the carrier driver will use the Amazon reference number (ARN) to identify your shipment. Ensure that your warehouse and security guard (if applicable) know the ARN to complete the pick-up. You can find the ARN in Seller Central.
Carrier guidelines – Next to the general PCP guidelines and the PCP LTL guidelines mentioned above, ensure that you follow the carrier-specific guidelines too. For more information, go to RXO and Kuehne & Nagel help page.
Less than truckload delivery programme benefits
Sellers participating in the Amazon Partnered Carrier programme can benefit from the following:

Access to competitive rates negotiated by Amazon with partnered carriers.
Fast transit times from carriers with experience shipping into Amazon.
Simplified booking experience by paying for shipments within Seller Central.
Schedule collections in Seller Central for less than LTLs.
Use Seller Central to print labels and track deliveries for less than truckload delivery deliveries.
Have a direct line to the carrier servicing your shipment to receive quick resolutions.
All shipments sent with the Partnered Carrier programme fall under the FBA lost and damaged inventory reimbursement policy.
Less than truckload PCP cost calculation – Fees
The best way to view partnered carrier fees for your shipment is to have a look in Seller Central once a shipment has been created:

In the new shipment creation workflow, complete step 1, adding all ASIN and box information. Once finished, you will be able to see the estimated cost for the Partnered Carrier Programme by looking at Shipping mode > Less than truckload (LTL) > Select shipping carrier.
For less than truckload delivery, fees are calculated based on pickup location postcode, destination fulfilment centre postcode and number of pallets being sent out. Take a look at the three examples below to get an idea of how fees are calculated and how the postcodes and number of pallets affects the price:
Note: As fees may change over time, the examples below may only be used as a general indication of how fees are calculated. Do not use them as a standard rule.
Fee calculation example 1 – Seller A is sending 1 pallet from their fulfilment centre in Germany with postcode 10023 to DTM2 (an Amazon fulfilment centre located near Dortmund, Germany).

Pick-up postcode is 10023 in Germany and destination postcode is 44145
Between those two postcodes, the price per pallet via PCP less than truckload delivery when sending 1 pallet = €49.44
Total cost for seller A: €49.44
Fee calculation example 2 – Seller A is sending a second shipment with 8 pallets from their fulfilment centre in Germany with postcode 10023 to DTM2 (an Amazon fulfilment centre located near Dortmund, Germany).

Pick-up postcode is 10023 in Germany and destination postcode is 44145
Between those two postcodes, the price per pallet via PCP less than truckload delivery when sending 8 pallets = €35.36
Total cost for seller A: 8 X €35.36 = €282.88
Fee calculation example 3 – Seller A is sending a third shipment with 8 pallets to DTM2 (an Amazon fulfilment centre located near Dortmund, Germany); however, they are using their second fulfilment centre located in France (25512).

Pick-up postcode is 25512 in France and destination postcode is 44145
Between those two postcodes, the price per pallet via PCP less than truckload delivery when sending 8 pallets = €78.98
Total cost for seller A: 8 X €78.98 = €631.84
Note: The examples shown above are excluding current promotions running on the programme. Amazon is running a promotion on inbounding stock into FBA. For more information, review the section Current FBA Promotions on the main Amazon Partnered Carrier Programme page.
Booking a shipment with PCP less than truckload in Seller Central
Booking a shipment in Seller Central

To participate in this programme, follow these steps in Seller Central:

Create a new shipment/replenishment in Seller Central.
Select the SKUs that you want to send to Amazon.
Select pick-up destination and destination store.
Important: Ensure that you fill in all information when entering your address (company name, street, postcode) and that the correct address is entered when using a third-party warehouse. This information will be sent to the carrier to finalise your shipment. Incorrect and missing information will cause a failed collection.
Select Amazon Partnered Carrier programme LTL in the shipment creation workflow.
Enter the point of contact for the shipment.
Important: Ensure that you fill in all information when entering your point of contact (name, email address, phone number) and that the person is easily reachable at all times. This information will be used by carriers to confirm your shipment or inform you of any delays/issues with your shipment. Incorrect contact details will result in a bad experience with the programme.
Enter the details of your delivery and accept the terms and conditions for the programme.
Important: Carefully review the Amazon Partnered Carrier terms and conditions and the carrier-specific terms and conditions. Go to the section above: LTL carrier you will work with .
Click Accept charges.
After finalising the shipment, you will be able to start tracking the shipment in Seller Central as well. For more information, refer to the Tracking with PCP less than truckload delivery section below.
Tracking with PCP less than truckload delivery
One of the main benefits of using PCP is that you will have end-to-end visibility into the shipping process until your goods have arrived at an Amazon fulfilment centre. For PCP less than truckload delivery, this is done via two portals that you can access: 1) Seller Central and 2) Carrier-specific tracking portals.

Here is a quick overview on how to use the tracking with PCP LTL effectively:

Tracking in Seller Central

Once shipments have been created, we provide updates in Seller Central on the Shipment events tab of each shipment.

On the same page, you will also see a tab called Track shipment. If you are using PCP less than truckload delivery and your shipment has been tendered to a carrier, you will receive the Amazon reference number (ARN) there. The ARN will be used by the carrier to identify your shipment during collection.

Lastly, under the tab Contents, you will see if all units have been received by the fulfilment centre. If there is a discrepancy, you will be able to start an investigation from here with Amazon as well.

Other important programme information
Carrier and seller interactions – Investigate a missed collection with the carrier

It is very important to note that all questions and issues will need to be handled directly with the carrier who is servicing your shipment until the goods have been shipped to an Amazon fulfilment centre. Queries that should be directly handled with the carrier are the following:

Pickup appointment change (only if within two working days)
Finalisation of shipment details
Missed pick-up/failed pick-up enquiries (unless you had not received any confirmation email, in which case, it may mean the carrier is not yet ready to pick up from you).
Pick-up confirmation
Pickup time
Shipment rejection reasons
Pickup process clarifications
Cross-border enquiries
Shipping delays, that is, goods have been picked up at your warehouse, but still have not arrived at the Amazon fulfilment centre after 48 hours.
Issues with accessing the carrier portal.
To contact the PCP less than truckload delivery carriers, use contact details on carrier-specific help pages RXO (formerly UPS SCS) and Kuehne & Nagel.

Amazon and seller interactions – Investigate a shipment that has arrived at an Amazon fulfilment centre

When your shipment has been completed and has the status Closed, that means your goods have completed shipping and has arrived at an Amazon fulfilment centre. Enquiries need to be directed to Amazon Selling Partner Support via a case in Seller Central. Investigations that are supported by Amazon when a signed and stamped POD is provided are:

Missing shipment investigations
Missing unit investigations
Reimbursement requests for PCP LTL costs
Reimbursement requests for missing units
To receive a signed and stamped POD (if available), go to the section Receiving a delivery confirmation for PCP LTL shipments below.

Cancelling a shipment with PCP less than truckload delivery

For PCP LTLs, you can cancel up to one hour after approving the estimated shipping charges. If your shipment pick-up date is more than two working days away, you must cancel your shipment in Seller Central and create a case with Selling Partner Support to request a refund. Go to your shipping queue and follow these steps:

Locate the shipment and click Work on shipment.
Click the Provide details tab.
Click Void charges.
Note: Cancelling the delivery does not cancel the charges. You must follow the instructions above to ensure that a pickup doesn’t take place and that charges don’t apply.
Editing a PCP LTL

Currently, we cannot process shipment changes through Seller Central. If your pick-up is within two working days (such as when you are enquiring on a Monday and your pick-up is on Wednesday), directly contact your carrier to reschedule/amend the shipment:

If your pick-up date is in more than two working days away, cancel your shipment in Seller Central and create a case with Selling Partner Support to request a full refund. Then create a new shipment with the correct information.

Documentation requirements for PCP less than truckload delivery – Labels and bill of lading (BOL)

Each carrier requires different documentation for picking up pallets, please review details on carrier-specific help pages RXO (formerly UPS SCS) and Kuehne & Nagel.

Furthermore, a bill of lading (BOL) will be required if two or more PCP LTLs are being picked up with the same truck. The BOL will be available in Seller Central on the day your shipment is being picked up by the carrier. Print the BOL and ensure that the driver signs off the document when you hand over the shipment.

Note: Cross-border shipments require additional documentation. For more information, go to Amazon Partnered Carrier programme – Cross-border shipment workflow.
Using a third-party warehouse for PCP LTLs

If you are working with a third-party warehouse as the collection point for your PCP LTL, ensure the following:

Pick-up address is correctly updated in Seller Central before the shipment is completed.
The warehouse is aware of the pallet guidelines in the programme and adheres to them. Not following the pallet guidelines will result in rejection of the shipment at the fulfilment centre.
Shipment has been prepared per the guidelines before the carrier appears for collection and is not only being prepared when the carrier arrives.
The warehouse has been made aware of the pick-up date when this has been confirmed via email by the carrier.
The warehouse is aware of the Amazon reference number (ARN) and carrier job number and knows that these references will be used when the shipment is being picked up by the carrier.
The warehouse has been made aware of the carrier-specific requirements and will adhere to them.
The warehouse has a direct contact to you if something needs to be clarified during the pick-up of the shipment.
Frequently asked questions

Will Amazon send me a confirmation of my shipment?
Yes. On the day before the arranged pickup, we will send you an email confirming the contents of the shipment, the pickup date and the primary point of contact. If you don’t receive this email by 2 p.m., raise a case with Selling Partner Support.

Can I get a confirmation receipt from the carrier after the driver picks up my shipment?
Yes, all carriers can sign a printed copy of the shipment confirmation that we send (see question above). This document can be used as proof of collection for your shipment.

Are there any restrictions on my pickup location?

Amazon’s partnered carriers cannot pick up from any ocean shipping terminal or port location. You must transfer your products to a shipping location outside the terminal or port, that can accommodate the carrier’s equipment.

Pickup from islands is excluded from the regular offer, and requires individual alignment with the carrier. For the full list, go to Amazon Partnered Carrier programme.

I ship my products to Amazon directly from the manufacturer or distributor. Can I still use the Partnered Carrier Programme?

Yes. All that you need are the shipment details when creating the shipment in Seller Central.

For example, if you want to use the Small Parcel Delivery (SPD) service, you must provide the number of boxes, and the weight and dimensions of each box, to get an estimated rate and print the shipping labels. Enter the manufacturer’s address as the ships-from location. Once you have printed the labels, send them to your manufacturer. Either you or your manufacturer must contact the carrier to organise the pickup.

Similarly, when selecting the Less than Truckload (LTL) service, you must provide the number of pallets, and the weight and dimensions of each pallet, to get an estimated rate. It’s best practice to include the supplier as the main point of contact for your business (provided in shipment booking) to organise the pickup. This will ensure that the carrier contacts the supplier to coordinate the pickup.

### generatePackingOptions
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/packingOptions \
     --header 'accept: application/json'
{
  "operationId": "string"
}
generatePackingOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/packingOptions


Generates available packing options for the inbound plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Responses

202
GeneratePackingOptions 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.



## Current Version
 Current version	Legacy versions	Availability	Sandbox
v2024-03-20 (Reference | Model)	v0	Sellers only	Static 

### confirmPlacementOption
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/placementOptions/placementOptionId/confirmation \
     --header 'accept: application/json'
{
  "operationId": "string"
}
onfirmPlacementOption
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/placementOptions/{placementOptionId}/confirmation


Confirms the placement option for an inbound plan. Once confirmed, it cannot be changed for the Inbound Plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

placementOptionId
string
required
length between 38 and 38
The identifier of a placement option. A placement option represents the shipment splits and destinations of SKUs.

Responses

202
ConfirmPlacementOption 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.



## cancelInboundPlan
 curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/cancellation \
     --header 'accept: application/json'
  {
  "operationId": "string"
  } 
  cancelInboundPlan
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/cancellation


Cancels an Inbound Plan. Charges may apply if the cancellation is performed outside of a void window. The window for Amazon Partnered Carriers is 24 hours for Small Parcel Delivery (SPD) and one hour for Less-Than-Truckload (LTL) carrier shipments.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Responses

202
CancelInboundPlan 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.



## Terminology
 Add terminology link/notes here 

## Key Features
 Add key features here 

## getInboundPlan
 curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId \
     --header 'accept: application/json'
  {
  "createdAt": "2024-03-20T12:01:00Z",
  "inboundPlanId": "wf1234abcd-1234-abcd-5678-1234abcd5678",
  "lastUpdatedAt": "2024-03-28T13:15:30Z",
  "marketplaceIds": [
    "A2EUQ1WTGCTBG2"
  ],
  "name": "FBA (03/20/2024, 12:01 PM)",
  "packingOptions": [],
  "placementOptions": [],
  "shipments": [],
  "sourceAddress": {
    "addressLine1": "123 example street",
    "addressLine2": "Floor 19",
    "city": "Toronto",
    "companyName": "Acme",
    "countryCode": "CA",
    "email": "email@email.com",
    "name": "name",
    "phoneNumber": "1234567890",
    "postalCode": "M1M1M1",
    "stateOrProvinceCode": "ON"
  },
  "status": "ACTIVE"
}
getInboundPlan
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}


Fetches the top level information about an inbound plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Responses

200
GetInboundPlan 200 response

Response body
object
createdAt
date-time
required
The time at which the inbound plan was created. In ISO 8601 datetime with pattern yyyy-MM-ddTHH:mm:ssZ.

inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

lastUpdatedAt
date-time
required
The time at which the inbound plan was last updated. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ssZ.

marketplaceIds
array of strings
required
A list of marketplace IDs.

name
string
required
Human-readable name of the inbound plan.

packingOptions
array of objects
Packing options for the inbound plan. This property will be populated when it has been generated via the corresponding operation. If there is a chosen placement option, only packing options for that placement option will be returned. If there are confirmed shipments, only packing options for those shipments will be returned. Query the packing option for more details.

object
packingOptionId
string
required
length between 38 and 38
Identifier of a packing option.

status
string
required
length between 1 and 1024
The status of a packing option. Possible values: 'OFFERED', 'ACCEPTED', 'EXPIRED'.

placementOptions
array of objects
Placement options for the inbound plan. This property will be populated when it has been generated via the corresponding operation. If there is a chosen placement option, that will be the only returned option. Query the placement option for more details.

object
placementOptionId
string
required
length between 38 and 38
The identifier of a placement option. A placement option represents the shipment splits and destinations of SKUs.

status
string
required
length between 1 and 1024
The status of a placement option. Possible values: OFFERED, ACCEPTED.

shipments
array of objects
A list of shipment IDs for the inbound plan. This property is populated when it has been generated with the confirmPlacementOptions operation. Only shipments from the chosen placement option are returned. Query the shipment for more details.

object
shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

status
string
required
length between 1 and 1024
The status of a shipment. The state of the shipment will typically start as UNCONFIRMED, then transition to WORKING after a placement option has been confirmed, and then to READY_TO_SHIP once labels are generated.

Possible values: ABANDONED, CANCELLED, CHECKED_IN, CLOSED, DELETED, DELIVERED, IN_TRANSIT, MIXED, READY_TO_SHIP, RECEIVING, SHIPPED, UNCONFIRMED, WORKING

sourceAddress
object
required
Specific details to identify a place.

addressLine1
string
required
length between 1 and 180
Street address information.

addressLine2
string
length between 1 and 60
Additional street address information.

city
string
required
length between 1 and 30
The city.

companyName
string
length between 1 and 50
The name of the business.

countryCode
string
required
length between 2 and 2
The country code in two-character ISO 3166-1 alpha-2 format.

districtOrCounty
string
length between 1 and 50
The district or county.

email
string
length between 1 and 1024
The email address.

name
string
required
length between 1 and 50
The name of the individual who is the primary contact.

phoneNumber
string
length between 1 and 20
The phone number.

postalCode
string
required
length between 1 and 32
The postal code.

stateOrProvinceCode
string
length between 1 and 64
The state or province code.

status
string
required
length between 1 and 1024
Current status of the inbound plan. Possible values: ACTIVE, VOIDED, SHIPPED, ERRORED.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

 ### confirmPackingOption
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/packingOptions/packingOptionId/confirmation \
     --header 'accept: application/json'
  {
  "operationId": "string"
  } 
  confirmPackingOption
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/packingOptions/{packingOptionId}/confirmation


Confirms the packing option for an inbound plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

packingOptionId
string
required
length between 38 and 38
Identifier of a packing option.

Responses

202
ConfirmPackingOption 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


## listInboundPlanItems
 curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/items?pageSize=10' \
     --header 'accept: application/json'
  {
  "items": [
    {
      "asin": "string",
      "expiration": "string",
      "fnsku": "string",
      "labelOwner": "string",
      "manufacturingLotCode": "string",
      "msku": "string",
      "prepInstructions": [
        {
          "fee": {
            "amount": 0,
            "code": "string"
          },
          "prepOwner": "string",
          "prepType": "string"
        }
      ],
      "quantity": 0
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listInboundPlanItems
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/items


Provides a paginated list of item packages in an inbound plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Query Params
pageSize
integer
1 to 1000
Defaults to 10
The number of items to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListInboundPlanItems 200 response

Response body
object
items
array of objects
required
The items in an inbound plan.

object
asin
string
required
length between 1 and 10
The Amazon Standard Identification Number (ASIN) of the item.

expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with patternYYYY-MM-DD. The same MSKU with different expiration dates cannot go into the same box.

fnsku
string
required
length between 1 and 10
A unique identifier assigned by Amazon to products stored in and fulfilled from an Amazon fulfillment center.

labelOwner
string
required
length between 1 and 1024
Specifies who will label the items. Options include AMAZON, SELLER, and NONE.

manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant-defined SKU ID.

prepInstructions
array of objects
required
Special preparations that are required for an item.

object
fee
object
The type and amount of currency.


fee object
prepOwner
string
length between 1 and 1024
In some situations, special preparations are required for items and this field reflects the owner of the preparations. Options include AMAZON, SELLER or NONE.

prepType
string
length between 1 and 1024
Type of preparation that should be done.

Possible values: ITEM_LABELING, ITEM_BUBBLEWRAP, ITEM_POLYBAGGING, ITEM_TAPING, ITEM_BLACK_SHRINKWRAP, ITEM_HANG_GARMENT, ITEM_BOXING, ITEM_SETCREAT, ITEM_RMOVHANG, ITEM_SUFFOSTK, ITEM_CAP_SEALING, ITEM_DEBUNDLE, ITEM_SETSTK, ITEM_SIOC, ITEM_NO_PREP, ADULT, BABY, TEXTILE, HANGER, FRAGILE, LIQUID, SHARP, SMALL, PERFORATED, GRANULAR, SET, FC_PROVIDED, UNKNOWN, NONE.

quantity
integer
required
1 to 500000
The number of the specified MSKU.

pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


## Use Cases
The following use case examples are available for the Fulfillment Inbound API:

- Create a shipment when the seller knows the carton-level information up-front: Learn how to create a shipment with known carton-level information.
- Create a shipment when the seller does not know the carton-level information up-front: Learn how to create a shipment when carton-level information is unknown.
- Create a shipment with an Amazon-partnered carrier (PCP): Learn how to inbound Small Parcel Deliveries (SPD) or pallets (LTL/FTL) with an Amazon-partnered carrier.
- Create a shipment with a non-partnered carrier: Learn how to inbound Small Parcel Deliveries (SPD) or pallets (LTL/FTL) with a non-partnered carrier.

### generateTransportationOptions
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/transportationOptions \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
{
  "operationId": "string"
}
generateTransportationOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions


Generates available transportation options for a given placement option.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Body Params

Expand All
⬍
The body of the request to generateTransportationOptions.

placementOptionId
string
required
length between 38 and 38
The placement option to generate transportation options for.

shipmentTransportationConfigurations
array of objects
required
length ≥ 1
List of shipment transportation configurations.


object

contactInformation
object
The seller's contact information.


contactInformation object
freightInformation
object
Freight information describes the SKUs that are in transit. Freight carrier options and quotes will only be returned if the freight information is provided.


freightInformation object
pallets
array of objects
List of pallet configuration inputs.


ADD object
readyToShipWindow
object
required
Contains only a starting DateTime.


readyToShipWindow object
shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.


ADD object
Responses

202
GenerateTransportationOptions 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.



### Create a shipment when the seller knows the carton-level information up-front
 Create a shipment when the seller knows the carton-level information up-front
Learn how to create a shipment with known carton-level information.

Learn how to create a shipment when the seller knows carton-level information.

Prerequisites
To complete this tutorial, you need:

Authorization from the selling partner for whom you are making calls. For more information, refer to Authorizing Selling Partner API applications.
Approval for the Amazon Fulfillment role and the Product Listing role in your developer profile.
The Amazon Fulfillment role and Product Listing role selected in the App registration page for your application.
To have created your listings and understand whether your items are eligible to be shipped to Amazon's fulfillment network (instructions included in optional step section)
Workflow
The following table outlines the steps to create a shipment when the seller knows carton-level information. This table is an illustrative example and does not include all of the optional operations.

Step	Description	Operations
Step 1. Create an inbound plan	Choose MSKU, quantity, and marketplace.	createInboundPlan
Step 2. Determine which SKUs can be packed together	Review and select a packing option.	generatePackingOptions
listPackingOptions
listPackingGroupItems
confirmPackingOption
Step 3. Provide box content information	Provide SKUs, weights, dimensions.	setPackingInformation
Step 4. Generate and view options for destination fulfillment centers	Amazon generates options for shipment splits based on boxes.	generatePlacementOptions
listPlacementOptions
Step 5. Input transportation data and generate transportation options	Input transportation data. Amazon generates options.	generateTransportationOptions
Step 6. Generate delivery window options	Amazon generates delivery window options.	generateDeliveryWindowOptions
Step 7. Review shipment splits and transportation options	Review placement, transportation, and delivery window options.	listPlacementOptions
listTransportationOptions
listDeliveryWindowOptions
getShipment
Step 8. Select shipping option	Select shipping option (shipment split).	confirmPlacementOption
Step 9. Select transportation options	Select desired delivery window and and transportation options.	confirmDeliveryWindowOptions
confirmTransportationOptions
Step 10. Print labels	Amazon generates box labels, carrier label if SPD PCP, pallet label if LTL.	getLabels
getBillOfLading
Step 11. Send your shipments to Amazon's fulfillment network	Pack and ship inventory.	listInboundPlanBoxes
Step 12. Providing tracking information	Provide tracking ID. Non-partnered carrier only.	updateShipmentTrackingDetails
Step 1. Create an Inbound Plan
Create an Inbound Plan by calling the asynchronous createInboundPlan operation. An Inbound Plan represents a collection of items that you intend to inbound into Amazon's fulfillment network. By calling the createInboundPlan operation, a seller must specify:

The address from which the inbound shipments will be sent
The marketplace where the product would be shipped
A summary of the items that they intend to inbound
The item summary must include MSKU, quantity, and an indication of who will prepare and label the item. Note that AMAZON can only be selected as the label owner if you are enrolled in the FBA Label Service. For more information about the FBA Label Service, refer to Seller Central Help for your marketplace.

Make sure each item you're shipping conforms to Amazon's product packaging requirements. For more information, refer to Packaging and Prep Requirements in Seller Central Help. For more information about Amazon's product packaging requirements for your marketplace, refer to Seller Central URLs. Note that sellers can set the Prep Category for SKUs on Send to Amazon. This can be done one by one or up to 25 at a time. This is a one-time activity per SKU that carries over to all future inbound plans.

📘
Note

Multiple expiration dates per SKU on a single inbound plan is not supported. To send a SKU with multiple expiration dates to the fulfillment network, you need to create multiple plans.

Optionally, a seller can include each item's expiration date and manufacturing lot code. A successful response includes an inboundPlanId that uniquely identifies the inbound plan, synonymous with the concept of "workflow ID", which is generated on Send to Amazon (the shipment creation workflow on Seller Central).

Check the status of a call
Check the status of an inbound request by using the getInboundOperationStatus operation. For asynchronous operations, this operation provides the processing status. We omit this step for other asynchronous operations in this tutorial. By calling getInboundOperationStatus, a seller passes the operationId, which is a Universal Unique Identifier (UUID) for the operation.

A successful response includes the request status and any non-blocking errors associated with the request. Non-blocking errors are warnings that can be ignored (for example, when the address is suspected to be wrong, but progression is allowed anyway).

Step 2. Determine which SKUs can be packed together
🚧
Warning

As of February 20, 2025, partial shipment splits are not available on the Send to Amazon workflow for standard-sized products. Partial shipment splits remain available for large bulky products. For more information, refer to 2025 FBA inbound placement service fee.

This step is necessary to determine which items can be packed together. Some items cannot be packed together due to differing handling or fulfillment center requirements. There might be a discount for further separating items.

📘
Note

There are only discounted options for Small Parcel Delivery (SPD) shipments in the EU. These discounted options can include additional requirements, including that each package must weigh less than 15 kilograms.

To determine which SKUs can be physically packed together, use the following operations:

generatePackingOptions
listPackingOptions
listPackingGroupItems
confirmPackingOption
A PackingGroup represents a set of SKUs that can be packed together. SKUs that cannot be packed together go into different pack groups. For example, SKUs that are classified as dangerous goods cannot be packed with other SKUs, because dangerous goods SKUs are shipped to special fulfillment centers that can receive them safely. Other factors that determine which SKUs can and cannot be packed together include SKU weights and dimensions, prep and labelling requirements, and barcode requirements.

The PackingOptions object represents the set of options for how items are mapped to packing groups. Each PackingOption includes a set of PackingGroups, which each contain a list of SKUs. Each of these options can have discounts or fees associated with them. Also, each option can be limited to a subset of all possible shipping modes. These packing operations enable the seller to review and select an option.

Step 2a. Generate packing options
Generate packing options with the generatePackingOptions operation.

Step 2b. List packing options
Review a list of the packing options with the listPackingOptions operation. Packing options contain sets of pack groups that a seller can choose, along with additional information that can help a seller choose between these options. Additional information includes fees/discounts associated with each option, shipping modes supported by each option, packing modes supported by each option, package weights supported by each option, and the expiration date of each option.

Step 2c. List items in each packing option
To view the items in each packing group, use the listPackingGroupItems operation.

Step 2d. Select a packing option
Choose a packing option with the confirmPackingOption operation.

Step 3. Provide box content information
To provide information related to the items that will be packed into each box, use the setPackingInformation operation. Providing this information ensures that the shipment splits generated in the subsequent step (generatePlacementOptions) are accurate. If no box information is provided at this step, the shipment splits generated in the next step are based only on the unit information passed to Amazon as part of createInboundPlan. By calling setPackingInformation, a seller must pass the following information for each box that they intend to inbound:

Packing group ID
Box content information source
Box contents (items, item quantities, prep/label owners for each item)
Box information (dimensions, weight, and quantity of boxes)
📘
Note

If a seller provides box packing information using setPackingInformation, generates placement options, and then edits their box packing information using setPackingInformation, then the seller needs to call generatePlacementOptions again prior to calling confirmPlacementOption. If a seller inputs their box packing information using setPackingInformation and then decides that they want to discard this information entirely, they need to start a new inbound plan with createInboundPlan. Discarding packing information is not currently supported.

Box content information source indicates how the seller intends to provide box content information, which could be through one of three options:

Populating the Contents field (BOX_CONTENT_PROVIDED)
Paying Amazon a fee to enter this information during the receiving process (MANUAL_PROCESS)
Affixing 2D barcodes to the boxes (BARCODE_2D)
The seller must also provide box dimensions, box weight, and the quantity of each box. When boxAttribute is set toBARCODE_2D or MANUAL_PROCESS:

You don't need to provide SKUs and quantities.
You must leave items empty (provide a null value).
A successful response includes the operationId that can be used to determine the status of the operation using getInboundOperationStatus.

📘
Note

In this flow, pass in the PackingGroupId but omit the ShipmentId.

Step 4. Generate and view options for destination fulfillment centers
🚧
Warning

As of February 20, 2025, partial shipment splits are not available on the Send to Amazon workflow for standard-sized products. Partial shipment splits remain available for large bulky products. For more information, refer to 2025 FBA inbound placement service fee.

Generate placement options for an inbound plan by calling the generatePlacementOptions operation. The PlacementOptions object represents the set of available placement options for an inbound plan, where each placement option describes the destination FCs and shipping options for each item in your inbound plan. These options help reduce the time it takes to receive a seller's items and make them available for sale. Refer to Seller Central Help for more details.

📘
Note

This operation generates initial shipment IDs for the shipments within each inbound plan. These IDs are different from the shipmentConfirmationIDs that confirmPlacementOption generates. The shipmentConfirmationID is the ID that is present on labels (for example, FBA1234ABCD). You can retrieve both of these shipment ID types with the getShipment operation.

Some of your options can include multiple destinations (refer to Seller Central Help for details). Each option can include fees or discounts, which are determined when your shipment is being created, and is not calculated using a set rate. The rebate value and ship-to location depend on multiple factors, including expected volume, the availability of carrier appointments, and fulfillment speed. The rebate that your shipment is eligible for is provided during shipment creation.

The terms and conditions can change. Review the current Seller Central terms and conditions, including the Amazon Services Business Solutions Agreement.

To view the options for shipment splits, call the listPlacementOptions operation. This operation provides the list of available placement options, which include:

A placement option ID
The option status ("offered" or "accepted")
Any fees/discounts associated with this option
The expiration date of the option
The shipment IDs associated with each option
When a placement option expires, you must regenerate placement options by calling generatePlacementOption. The placement option ID is required to generate transportation options with generateTransportationOptions, while shipment IDs are used to understand the contents of each shipment using getShipment.

Step 5. Input transportation data and generate transportation options
Generate transportation options with the generateTransportationOptions operation. A transportation option represents the list of shipping mode and carrier options that are available for each shipment within each placement option. By calling generateTransportationOptions, a seller must pass the following information:

Placement option ID
Shipment ID
Ready-to-ship date
Ship-from address
Step 6. Generate delivery window options
Call generateDeliveryWindowOptions with the shipmentID of the shipment for which you intend to generate delivery windows.

🚧
Important

Sellers must confirm transportation options for all shipment types. For non-partnered shipments, sellers must also specify a delivery window.

Delivery windows are periods during which a seller can deliver their shipment to the destination fulfillment center. If the seller uses a non-partnered carrier, they must specify a seven-day delivery window for domestic shipments or a 14-day window for international shipments. The window is used to provide a shipment's expected arrival date and time at an Amazon fulfillment center. An available delivery window option is necessary for shipments that don't have an appointment slot with a fulfillment center. For example, shipments through non-partnered carriers need a confirmed delivery window.

Step 7. Review shipment splits and transportation options
Review shipment and transportation options by calling the following operations:

listPlacementOptions
listTransportationOptions
listDeliveryWindowOptions
getShipment
listPlacementOptions provides the list of available placement options, which includes a placement option ID, the status of the option (that is, offered vs. accepted), any fees/discounts associated with this option, the expiration date of the option, and the shipment IDs associated with each option.

To call listTransportationOptions, a seller needs to pass the placement option ID and shipment ID for which they want to view transportation options. If transportation options are not available for a placement option, call listTransportationOptions again for an alternative placement option. A successful response includes all available transportation quotes for all available ship modes and carrier options. Shipping modes include:

Ground small parcel
Less-than-truckload freight
Full truckload freight (palletized)
Full truckload freight (non-palletized)
Less than container load ocean
Full container load ocean
Air small parcel
Air small parcel express
Carrier options include Amazon-partnered and non-partnered carriers. Quotes include:

Cost
A void window (the period where a seller can cancel a shipment and receive a refund for their transportation quote)
Expiration
In regions where fulfillment center appointments are mandatory (for example, India), we provide available appointment slots.

Where the Partnered Carrier Program (PCP) is available, sellers can take advantage of discounted rates by using an Amazon-partnered carrier for their inbound shipments. To use an Amazon-partnered carrier for an inbound shipment, select the transportation option where shippingSolution is AMAZON_PARTNERED_CARRIER.

📘
Note

Before you use an Amazon-partnered carrier for an inbound shipment, you must read the Seller Central Help about Amazon's PCP to help ensure that you successfully follow the program instructions and guidelines (Europe) (US).

In the EU region, you must first review and accept the terms and conditions of the carrier and the terms and conditions of Amazon's PCP. You can do this on Seller Central. If you attempt to use Amazon Selling Partner APIs to create an inbound shipment by using an Amazon-partnered carrier before accepting these terms and conditions, the service returns an error.

If a seller doesn't want to participate in the PCP, they can view Choose your own carrier transportation options and available shipping modes.

Amazon filters out partnered carrier transportation options in certain situations. For example, if there is a partnered carrier transportation option at a lower price for a placement option that has identical shipment splits, then Amazon filters out the more expensive transportation option. If you plan to use a partnered carrier, call listTransportationOptions for each placement option to see the available partnered carrier options.

📘
Note

You can include a mix of Small Parcel Delivery (SPD) and LTL shipments in one inbound plan. You can also include a mix of PCP and non-PCP shipments in one inbound plan if:

The different carrier selections are assigned to different shipping modes (for example SPD and LTL).
All shipments in the inbound plan are eligible for PCP.
For example, you can create an inbound plan with one PCP SPD shipment and one non-PCP LTL shipment, assuming that all shipments within the inbound plan are eligible for PCP.

For more information about PCP eligibility, refer to the PCP help page.

Review available delivery window options for each shipment within an inbound plan using the listDeliveryWindowOptions operation. To make this call, a seller passes the shipmentID. A successful response provides the startDate and endDate for each available delivery window and the level of congestion (availabilityType) for each option.

🚧
Important

Sellers must confirm transportation options for all shipment types. For non-Amazon partnered shipments, they must also specify a delivery window.

Each option has an expiration date (validUntil). You must confirm the delivery before this date. If you don't confirm the window by the validUntil date, you must generate a new window using listDeliveryWindowOptions.

Review details related to the contents of a shipment within an inbound plan using the getShipment operation. To call getShipment, a seller needs to pass the inbound plan ID and shipment ID. A successful response includes the following:

Placement option ID
Shipment confirmed ID (the ID that shows up on labels)
Shipment ID (the identifier for a shipment prior to the confirmPlacementOption operation)
Amazon reference ID (identifier for scheduling fulfillment center appointments for truck deliveries)
Selected transportation option ID
Name
Source
Destination FC
Ship date
Estimated delivery date
Status
Tracking details
Pallet information
Contact information
Destination region
FC appointment details
📘
Note

If the seller selects a partnered carrier, meaning that destinationType is AMAZON_OPTIMIZED, then the destination fulfillment center address may differ from the actual address, or this field may be empty. Refer to the carton label for the correct address.

Step 8. Select shipping option
Select shipment option (that is, shipment splits) with the confirmPlacementOption operation. This operation selects the placement splits for an inbound plan and creates confirmed shipment IDs for shipments within the inbound plan. The shipmentConfirmationID is the shipment identifier that appears on labels (for example, FBA1234ABCD). This ID is different from the shipment ID that is generated with createInboundPlan, which is used as an input to other operations, such as getShipment. This option cannot be reversed after it is selected. To call confirmPlacementOption, a seller must pass the inbound plan ID and the selected placement option ID.

📘
Note

createInboundPlan generates initial shipment IDs for the shipments in each inbound plan. These IDs are different from the shipmentConfirmationIDs that confirmPlacementOption generates. The shipmentConfirmationID is the identifier that is present on labels (for example, FBA1234ABCD). You can retrieve both types of shipment IDs with the getShipment operation.

Step 9. Select transportation options
Select delivery windows for each shipment within a plan using the confirmDeliveryWindowOptions operation. To call this operation, pass the shipmentID and deliveryWindowOptionId (provided by listDeliveryWindowOptions).

You must confirm a placement option for the shipment before you call this operation. After you confirm the delivery window, new delivery window options cannot be generated. However, you can update the selected delivery window option before shipment closure. For all transportation options that have the program DELIVERY_WINDOW_REQUIRED, you must confirm a delivery window before you confirm the transportation option. If you need to update your delivery window after you confirm the transportation option, you can call confirmDeliveryWindow.

🚧
Warning

For non-partnered carrier shipments, sellers must confirm their anticipated delivery window by calling confirmTransportationOptions before they book their fulfillment center (FC) appointment.

Sellers should ask their non-partnered carrier to book an FC appointment that is within their anticipated delivery window. If the FC appointment date does not fall within the delivery window, the seller can call confirmDeliveryWindow to select another delivery window that does contain their FC appointment date.

This mandatory step allows you to select transportation options for each shipment within an inbound plan using the confirmTransportationOptions operation. For Amazon-partnered transportation options, this operation confirms that the seller accepts the Amazon-partnered shipping estimate, agrees to allow Amazon to charge their account for the shipping cost, and requests that the Amazon-partnered carrier ships the inbound shipment. Before this call, a seller must confirm a placement option for their inbound plan. To call confirmTransportationOptions, a seller must pass the shipment ID, selected transportation option ID, and contact information (needed for partnered carriers for LTL shipments). When a transportation option is confirmed, new transportation options cannot be generated or confirmed for an inbound plan. You must confirm a transportation option before printing labels.

Cancel a shipment
If a seller confirms the transportation request, then decides they don't want the Amazon-partnered carrier to ship the inbound shipment, you can call cancelInboundPlan to cancel the transportation request.

For Small parcel shipments, the seller has 24 hours after confirming a transportation request to void the request. For Less Than Truckload / Full Truckload (LTL/FTL) shipments, the seller has one hour after confirming a transportation request to void the request. After the relevant time period expires, the seller's account is charged for the shipping cost.

Step 10. Print labels
Call the getLabels operation to request unique shipping labels for your inbound shipments. Each shipping label returned by the getLabels operation should be affixed to the package in the shipment that it corresponds to, so the labels indicate the package contents. This helps to ensure that your shipment is processed at the Amazon fulfillment center quickly and accurately.

🚧
Warning

The value of shipmentId in the getLabels request must be the shipmentId (from v0) or the shipmentConfirmationId (from v2024-03-20). Do not use the shipmentId from v2024-03-20.

To print labels for a specific box, specify the boxID (from the listShipmentBoxes response) as the PackageLabelsToPrint value.

Note that the shipment status does not become ready_to_ship if you retrieve carton labels with getLabels. For a shipment status to become ready_to_ship, you must generate labels on Send to Amazon.

Information included on shipping labels
In all circumstances, the getLabels operation returns shipping labels that include a unique bar code and Package ID (the string located directly under the bar code). Depending on the contents of the packages in your shipments, the labels can also include an ASIN and an expiration date.

Shipping labels include an ASIN and an expiration date in either of the following situations:

Every item in the shipment shares the same ASIN and expiration date.
The shipment includes multiple ASINs, but every package in the shipment contains items that share the same ASIN and expiration date.
Shipping labels include an ASIN and no expiration date in either of the following situations:

Every item in the shipment shares the same ASIN. The ASIN does not have an expiration date.
The shipment includes multiple ASINs, but every package in the shipment contains items that share the same ASIN. The ASINs do not have expiration dates.
Shipping labels do not include an ASIN or an expiration date when the shipment contains at least one package with items that do not share the same ASIN and expiration date.

📘
Construct a unique barcode for small parcel shipments

For Small Parcel shipments, the shipping label for each package should have a unique barcode. This helps ensure that your shipment is processed in a timely manner when it reaches Amazon's fulfillment network. To construct unique barcode values for each package in a shipment, do the following:

Start with the Shipment ID value and append U and 000001 to get the barcode value for the first package in the shipment.

To get the barcode values for each successive package in the shipment, increment the trailing numerical value of the previous package by one. For example, If you have three packages in a shipment with a Shipment ID value of FBA1MMD8D0, your three barcode values would be FBA1MMD8D0U000001, FBA1MMD8D0U000002, and FBA1MMD8D0U000003. A box label identified with its own unique numerical identifier must follow the 6-digit number format after U, printed and affixed to each carton you send to a fulfillment center (for example, U000001, U000002, U000003).

Step 11. Send your shipments to Amazon's fulfillment network
Send your shipments to Amazon's fulfillment network using an Amazon-Partnered carrier or a non-Amazon-Partnered carrier that is registered with Amazon. For more information about sending shipments to Amazon's fulfillment network, refer to the Seller Central Help for your marketplace.

As you prepare your shipment, you can retrieve all of the box-level information that you have entered for an inbound plan using the listInboundPlanBoxes operation.

Step 12. Providing tracking information
After sending a shipment to Amazon's fulfillment network using a non-partnered carrier, a seller must share the tracking ID using the updateShipmentTrackingDetails operation. To call this operation, a seller must pass the shipment ID and tracking details for their less-than-truckload or small parcel shipment. For less-than-truckload shipments, the seller must provide a PRO number (also known as Freight Bill number) and can optionally provide a BOL number. For small parcel shipments, the seller must share an array of box IDs and associated tracking IDs. 

### Create a shipment when the seller does not know the carton-level information up-front
 Create a shipment when the seller does not know the carton-level information up-front
Learn how to create a shipment with unknown carton-level information.

Learn how to create a shipment with unknown carton-level information.

Prerequisites
To complete this tutorial, you need:

Authorization from the selling partner for whom you are making calls. For more information, refer to Authorizing Selling Partner API applications.
Approval for the Amazon Fulfillment role and the Product Listing role in your developer profile.
The Amazon Fulfillment role and Product Listing role selected in the App registration page for your application.
To have created your listings and understand whether your items are eligible to be shipped to Amazon's fulfillment network (instructions included in optional step section)
Workflow
The following table outlines the steps to create a shipment when the seller does not know carton-level information. This table is an illustrative example and does not include all of the optional operations.

Step	Description	Operations
Step 1. Create an inbound plan	Choose MSKU, quantity, and marketplace.	createInboundPlan
Step 2. Generate and view options for destination fulfillment centers	Amazon generates available options for shipment splits based on units.	generatePlacementOptions
Step 3. Select shipping option	Select shipping option (shipment split).	listPlacementOptions
getShipment
listShipmentItems
confirmPlacementOption
Step 4. Provide box content information	Provide SKUs, weights, dimensions.	setPackingInformation
Step 5. Input transportation data, generate transportation options, and view options	Input transportation data. Amazon generates options.	generateTransportationOptions
generateDeliveryWindowOptions
listTransportationOptions
listDeliveryWindowOptions
Step 6. Select transportation options	Select desired delivery window and transportation options.	confirmDeliveryWindowOptions
confirmTransportationOptions
Step 7. Print labels	Amazon generates box labels, carrier label if SPD PCP, pallet label if LTL.	getLabels
getBillOfLading
Step 8. Send your shipments to Amazon's fulfillment network	Pack and ship inventory.	listInboundPlanBoxes
Step 9. Providing tracking information	Provide tracking ID. Non-partnered carrier only.	updateShipmentTrackingDetails
Step 1. Create an Inbound Plan
📘
Note

The process for creating a shipment when the carton-level information is not known upfront is only available for LTL shipments.

Create an Inbound Plan by calling the asynchronous createInboundPlan operation. An Inbound Plan represents a collection of inbound shipments that contain items you intend to inbound into Amazon's fulfillment network. By calling the createInboundPlan operation, a seller must specify:

The address from which the inbound shipments will be sent
The marketplace where the product would be shipped
Contact information (needed for partnered carriers for LTL shipments)
A summary of the items they intend to inbound
The item summary must include MSKU, quantity, and an indication of who will prepare/label the item. Note that AMAZON_LABEL is available only if you are enrolled in the FBA Label Service. For more information about the FBA Label Service, refer to the Seller Central Help for your marketplace.

Make sure each item you ship conforms to Amazon's product packaging requirements. For more information, refer to Packaging and Prep Requirements in Seller Central Help. For more information about Amazon's product packaging requirements for your marketplace, refer to Seller Central URLs. You can set the Prep Category for SKUs on Send to Amazon Step 1. You can do this one at a time or up to 25 at a time. This is a one-time activity per SKU that carries over to all future inbound plans.

📘
Note

Multiple expiration dates per SKU on a single inbound plan is not supported. To send a SKU with multiple expiration dates to the fulfillment network, you need to create multiple plans.

Optionally, a seller can include each item's expiration date and manufacturing lot code. A successful response includes an inboundPlanId, which is a unique identifier for the inbound plan, synonymous with the concept of "workflow ID", which is generated on Send to Amazon (the shipment creation workflow on Seller Central).

📘
Note

createInboundPlan generates initial shipment IDs for the shipments within each inbound plan. These IDs are different from the shipmentConfirmationIDs that are generated with the confirmPlacementOption operation. The shipmentConfirmationID is the identifier that appears on labels (for example, FBA1234ABCD). Both of these types of shipment IDs can be retrieved with the getShipment operation.

Check the status of a call
Check the status of an inbound request by using the getInboundOperationStatus operation. For asynchronous operations, this operation provides the processing status. We omit this step for other asynchronous operations in this tutorial. By calling getInboundOperationStatus, a seller passes the operationId, which is a Universal Unique Identifier (UUID) for the operation. A successful response includes the request status and can include a list of errors associated with the request.

Step 2. Generate and view options for destination fulfillment centers
Generate and view placement options for an inbound plan by calling the generatePlacementOptions, listPlacementOptions, and getShipment operations.

🚧
Warning

Sellers cannot provide packing information using Send to Amazon after confirming placement options. They will not be able to access API-created shipments on Send to Amazon during this step.

The placementOptions object represents the set of available placement options for an inbound plan, where each placement option describes the destination FCs and shipping options for each item in your inbound plan. These options are designed to help reduce the time that it takes to receive a seller's items and make them available for sale (refer to Seller Central Help for more details).

Some of your options can include multiple destinations (refer to Seller Central Help for details). Each option can include fees or discounts, which are determined using an algorithm when your shipment is being created, and is not calculated using a set rate. The algorithm for the rebate value and the ship-to location uses multiple factors to optimize your shipments, including expected volume, the availability of carrier appointments, and fulfillment speed. The rebate that your shipment is eligible for is provided during shipment creation.

The terms and conditions can change. Review the current Seller Central terms and conditions, including the Amazon Services Business Solutions Agreement.

📘
Note

When a seller calls generatePlacementOptions without inputting box content information, Amazon provides placement options that are optimized for unit-level data (because Amazon does not yet have box data). These options can differ from the placement options that are generated after a seller provides box content information (using setPackingInformation).

View the options for shipment splits by calling the listPlacementOptions operation. This operation provides the list of available placement options, which include:

A placement option ID
The option status ("offered" or "accepted")
Any fees/discounts associated with this option
The expiration date of the option
The shipment IDs associated with each option
When a placement option expires, you must regenerate placement options by calling generatePlacementOption. The placement option ID is required to generate transportation options with generateTransportationOptions, while shipment IDs are used to understand the contents of each shipment using getShipment (refer to the following).

Review details related to the contents of a shipment within an inbound plan using the getShipment operation. To call getShipment, a seller needs to pass the inbound plan ID and shipment ID. A successful response includes placement option ID, shipment confirmed ID (that is, the ID that shows up on labels, created after confirmPlacementOption), shipment ID (that is, identifier for a shipment prior to the confirmPlacementOption operation), Amazon reference ID (identifier for scheduling fulfillment center appointments for truck deliveries), selected transportation option ID, name, source, destination FC, ship date, estimated delivery date, status, tracking details, pallet information, contact information, destination region, and FC appointment details.

Step 3. Select shipping option
Select shipping options with the confirmPlacementOption operation. This operation selects the placement option for an inbound plan and creates confirmed shipment IDs for shipments within the inbound plan. The shipmentConfirmationID is the shipment identifier that appears on labels (for example, FBA1234ABCD). This ID differs from the initial shipment ID generated by createInboundPlan. This option cannot be reversed after it is selected. To call confirmPlacementOption, a seller must pass the inbound plan ID and the selected placement option ID.

📘
Note

Quotes are only returned for transportation options that are associated with PCP shipments. Expiry date and void window are only returned for transportation options that are confirmed with confirmTransportationOptions.

Step 4. Provide box content information
❗️
Important

This is a mandatory step. If you do not call setPackingInformation, there may be defects in the receiving process and fees for manual processing. For more information, refer to FBA manual processing fee.

❗️
Important

Starting January 1, 2026, the prep and item label services will no longer be available for FBA in the US marketplace. The seller must prep and label all products before they send them to the Amazon fulfillment network in the US.

📘
Note

You need to know which items are associated with each shipment before you call setPackingInformation. You can get this information on STA and from the API. If you pass incorrect information, you receive an error message with the expected quantities. You can also retrieve this information for your shipment on Send to Amazon.

Provide information related to what items will be packed into each box by using the setPackingInformation operation. By calling setPackingInformation, a seller must pass the following information for boxes they intend to inbound:

The package grouping ID (that is, the shipment ID of the confirmed placement option) of every shipment
Box content information source
Box contents (items, item quantities, prep/label owners for each item)
Box information (dimensions, weight, and quantity of boxes)
A successful response includes the operationId that can be used to determine the status of the operation using getInboundOperationStatus.

⭐
Tip

In this flow, include ShipmentId and omit PackingGroupId.

List shipment items
View a paginated list of items in a shipment by calling the listShipmentItems operation. Sellers must pull this information to understand which items are in each shipment split when they haven't input the carton level information upfront. To call this API, a seller must pass the shipment ID. A successful response contains a paginated list of the products the user previously entered using the createInboundPlan operation. The response contains the prep instructions for their ASINs, such as prep type and owner. This allows users to conveniently check what items and prep requirements are in a given shipment. The response lists the product’s MSKU, ASIN, FNSKU, Manufacturer Code, quantity, and expiration date if needed. This can be used to generate a pick list which they can use to pull certain items from their inventory and group them into a shipment. The seller then uses the listShipmentBoxes operation to create a pack list that specifies which items go in which boxes.

Step 5. Input transportation data, generate transportation options, and view options
Generate transportation options with the generateTransportationOptions operation. A transportation option represents the list of available shipping mode and carrier options that are available for each shipment within each placement option. By calling generateTransportationOptions, a seller must pass the following information:

Placement option ID
Shipment ID
Expected delivery date
Ship-from address, and optionally
Pallet information. If pallet information is not included, LTL transportation options aren't generated.
Review shipment and transportation options by calling the listTransportationOptions, listDeliveryWindowOptions, and getShipment operations.

To call listTransportationOptions, a seller needs to pass the placement option ID and shipment ID for which they want to view transportation options. A successful response includes all available transportation quotes for all available ship modes and carrier options. Shipping modes include:

Ground small parcel
Less-than-truckload freight
Full truckload freight (palletized)
Full truckload freight (non-palletized)
Less than container load ocean
Full container load ocean
Air small parcel
Air small parcel express
Carrier options include Amazon-partnered and non-partnered carriers. Quotes include the cost, a void window (for example, duration where a seller can cancel a shipment and receive a refund for their transportation quote), and expiration for each quote. In regions where fulfillment center appointments are mandatory (for example, India), we provide available appointment slots.

Where the Partnered Carrier Program (PCP) is available, sellers can take advantage of discounted rates by using an Amazon-partnered carrier for their inbound shipments.

To use an Amazon-partnered carrier for an inbound shipment, select the transportation option where shippingSolution is AMAZON_PARTNERED_CARRIER.

📘
Note

Before you can use an Amazon-partnered carrier for an inbound shipment, you must read the Seller Central Help about Amazon's PCP to help ensure that you successfully follow the program instructions and guidelines (Europe) (US).

In the EU region, before using an Amazon-partnered carrier for an inbound shipment, you must first review and accept the terms and conditions of the carrier and the terms and conditions of Amazon's PCP. You can do this on Seller Central. If you attempt to use Amazon Selling Partner APIs to create an inbound shipment by using an Amazon-partnered carrier before accepting these terms and conditions, the service returns an error.

If a seller doesn't want to participate in the PCP, they can view Choose your own carrier transportation options and available shipping modes.

Review the available delivery window options for each shipment within an inbound plan using the listDeliveryWindowOptions operation. To make this call, a seller needs to pass the shipmentID. A successful response provides the startDate and endDate for each available delivery window and the level of congestion (availabilityType) for each option. Note that each option has an expiration date (validUntil). You must confirm the delivery before this date. If you don't confirm the window by the validUntil date, you must generate a new window using listDeliveryWindowOptions.

Review the details related to the contents of a shipment within an inbound plan using the getShipment operation. To call getShipment, a seller needs to pass the inbound plan ID and shipment ID. A successful response includes:

Placement option ID
Shipment confirmed ID (that is, the ID that shows up on labels)
Shipment ID (that is, identifier for a shipment prior to the confirmPlacementOption operation)
Amazon reference ID (identifier for scheduling fulfillment center appointments for truck deliveries)
Selected transportation option ID
Name
Source
Destination FC
Ship date
Estimated delivery date
Status
Tracking details
Pallet information
Contact information
Destination region
FC appointment details
Step 6. Select transportation options
❗️
Important

For non-partnered carrier shipments, sellers must confirm their anticipated delivery window by calling confirmTransportationOptions before they book their fulfillment center (FC) appointment.

Sellers should ask their non-partnered carrier to book an FC appointment that is within their anticipated delivery window. If the FC appointment date does not fall within the delivery window, the seller can call confirmDeliveryWindow to select another delivery window that does contain their FC appointment date.

Select transportation options for each shipment within an inbound plan using the confirmTransportationOptions operation. For Amazon-partnered transportation options, this operation confirms that the seller accepts the Amazon-partnered shipping estimate, agrees to allow Amazon to charge their account for the shipping cost, and requests that the Amazon-partnered carrier ship the inbound shipment. Prior to this call, a seller must have confirmed a placement option for their inbound plan. To call confirmTransportationOptions, a seller must pass the shipment ID, selected transportation option ID, contact information (needed for partnered carriers for LTL shipments), and estimated delivery date. The estimated delivery date (delivery window) is a requirement for non-partnered carrier options and should not be populated for partnered carrier options. After a transportation option is been confirmed, new transportation options cannot be generated or confirmed for an inbound plan.

Cancel a shipment
If a seller confirms the transportation request, then decides they don't want the Amazon-partnered carrier to ship the inbound shipment, you can call cancelInboundPlan to cancel the transportation request.

For Small parcel shipments, the seller has 24 hours after confirming a transportation request to void the request. For Less Than Truckload / Full Truckload (LTL/FTL) shipments, the seller has one hour after confirming a transportation request to void the request. After the relevant time period expires, the seller's account is charged for the shipping cost.

Step 7. Print labels
Call the getLabels operation to request unique shipping labels for your inbound shipments. Each shipping label returned by the getLabels operation should be affixed to the package in the shipment that it corresponds to, so the labels indicate the package contents. This helps to ensure that your shipment is processed at the Amazon fulfillment center quickly and accurately.

🚧
Warning

The value of shipmentId in the getLabels request must be the shipmentId (from v0) or the shipmentConfirmationId (from v2024-03-20). Do not use the shipmentId from v2024-03-20.

To print labels for a specific box, specify the boxID (from the listShipmentBoxes response) as the PackageLabelsToPrint value.

Note that the shipment status does not become ready_to_ship if you retrieve carton labels with getLabels. For a shipment status to become ready_to_ship, you must generate labels on Send to Amazon.

Information included on shipping labels
In all circumstances, the getLabels operation returns shipping labels that include a unique bar code and Package ID (the string located directly under the bar code). Depending on the contents of the packages in your shipments, the labels can also include an ASIN and an expiration date.

Shipping labels include an ASIN and an expiration date in either of the following situations:

Every item in the shipment shares the same ASIN and expiration date.
The shipment includes multiple ASINs, but every package in the shipment contains items that share the same ASIN and expiration date.
Shipping labels include an ASIN and no expiration date in either of the following situations:

Every item in the shipment shares the same ASIN. The ASIN does not have an expiration date.
The shipment includes multiple ASINs, but every package in the shipment contains items that share the same ASIN. The ASINs do not have expiration dates.
Shipping labels do not include an ASIN or an expiration date when the shipment contains at least one package with items that do not share the same ASIN and expiration date.

📘
Construct a unique barcode for small parcel shipments

For Small Parcel shipments, the shipping label for each package should have a unique barcode. This helps ensure that your shipment is processed in a timely manner when it reaches Amazon's fulfillment network. To construct unique barcode values for each package in a shipment, do the following:

Start with the Shipment ID value and append U and 000001 to get the barcode value for the first package in the shipment.

To get the barcode values for each successive package in the shipment, increment the trailing numerical value of the previous package by one. For example, If you have three packages in a shipment with a Shipment ID value of FBA1MMD8D0, your three barcode values would be FBA1MMD8D0U000001, FBA1MMD8D0U000002, and FBA1MMD8D0U000003. A box label identified with its own unique numerical identifier must follow the 6-digit number format after U, printed and affixed to each carton you send to a fulfillment center (for example, U000001, U000002, U000003).

Step 8. Send your shipments to Amazon's fulfillment network
Send your shipments to Amazon's fulfillment network using an Amazon-Partnered carrier or a non-Amazon-Partnered carrier that is registered with Amazon. For more information about sending shipments to Amazon's fulfillment network, refer to the Seller Central Help for your marketplace.

As you prepare your shipment, you can retrieve all of the box-level information that you have entered for an inbound plan using the listInboundPlanBoxes operation.

Step 9. Providing tracking information
After sending a shipment to Amazon's fulfillment network using a non-partnered carrier, a seller must share the tracking ID using the updateShipmentTrackingDetails operation. To call this operation, a seller must pass the shipment ID and tracking details for their less-than-truckload or small parcel shipment. For less-than-truckload shipments, the seller must provide a PRO number (also known as Freight Bill number) and can optionally provide a BOL number. For small parcel shipments, the seller must share an array of box IDs and associated tracking IDs. 


### generatePlacementOptions
  curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/placementOptions \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
  {
  "operationId": "string"
  }
  generatePlacementOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/placementOptions


Generates placement options for the inbound plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Body Params

Expand All
⬍
The body of the request to generatePlacementOptions.

customPlacement
array of objects
Custom placement options you want to add to the plan. This is only used for the India (IN - A21TJRUUN4KGV) marketplace.


ADD object
Responses

202
GeneratePlacementOptions 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.
### confirmTransportationOptions
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/transportationOptions/confirmation \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
{
  "operationId": "string"
}
confirmTransportationOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions/confirmation


Confirms all the transportation options for an inbound plan. A placement option must be confirmed prior to use of this API. Once confirmed, new transportation options can not be generated or confirmed for the Inbound Plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Body Params

Expand All
⬍
The body of the request to confirmTransportationOptions.

transportationSelections
array of objects
required
length ≥ 1
Information needed to confirm one of the available transportation options.


object

contactInformation
object
The seller's contact information.


contactInformation object
shipmentId
string
required
length between 38 and 38
Shipment ID that the transportation Option is for.

transportationOptionId
string
required
length between 38 and 38
Transportation option being selected for the provided shipment.


ADD object
Responses

202
ConfirmTransportationOptions 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### listDeliveryWindowOptions
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/deliveryWindowOptions?pageSize=10' \
     --header 'accept: application/json'
{
  "deliveryWindowOptions": [
    {
      "availabilityType": "AVAILABLE",
      "deliveryWindowOptionId": "dw1234abcd-1234-abcd-5678-1234abcd5678",
      "endDate": "2024-01-05T20:00:00.000Z",
      "inboundPlanId": "wf1234abcd-1234-abcd-5678-1234abcd5678",
      "placementOptionId": "pl1234abcd-1234-abcd-5678-1234abcd5678",
      "shipmentId": "sh1234abcd-1234-abcd-5678-1234abcd5678",
      "startDate": "2024-01-05T14:00:00.000Z",
      "validUntil": "2024-01-05T20:00:00.000Z"
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listDeliveryWindowOptions
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions


Retrieves all delivery window options for a shipment. Delivery window options must first be generated by the generateDeliveryWindowOptions operation before becoming available.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
The shipment to get delivery window options for.

Query Params
pageSize
integer
1 to 100
Defaults to 10
The number of delivery window options to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.


### Create a shipment with an Amazon-partnered carrier (PCP)
 Create a shipment with an Amazon-partnered carrier (PCP)
Learn how to inbound small parcel deliveries or pallets with Amazon-partnered carriers

Learn how to inbound Small Parcel Deliveries (SPD) or pallets (LTL/FTL) with an Amazon-partnered carrier using the Fulfillment Inbound API.

Diagram of partnered carrier workflow

Step 1. Create an inbound plan
Operation
createInboundPlan
Parameters
destinationMarketplaces: Target marketplaces for shipment.
sourceAddress: Address from which items are shipped.
items:
prepOwner: Preparation owner.
labelOwner: Labeling owner.
msku: Merchant SKU.
itemQuantity: Quantity of items.
Response
Includes inboundPlanId and operationId to check the status of inbound plan creation.
Create Inbound Plan
Open Recipe
📘
Note

POST operations are asynchronous. Check the status of a POST operation by passing its operationId to getInboundOperationStatus.

Get Inbound operation status
Open Recipe
Step 2. Generate packing options
Operation
generatePackingOptions
Parameters
inboundPlanId: Use the inbound plan ID created in Step 1.
Response
operationId: An ID that you can use to check the status of packing options generation.
Generate packing options
Open Recipe
Step 3. List packing options
Operation
listPackingOptions
Parameters
inboundPlanId: Input the inbound plan ID.
Response
Includes available packingOptions. Each packing option is represented by a packingOptionId.
Each packing option contains one or more packingGroups, identified by packingGroupId. Each packing group includes a list of SKUs that should be packed together.
To view the SKU items in a packing group, call listPackingGroupItems with the packing group's packingGroupId.

📘
Note

Choose only one packing option (packingOptionId).

List packing options
Open Recipe
Step 4. Confirm packing option
Operation
confirmPackingOption
Parameters
inboundPlanId: The ID of the inbound plan.
packingOptionId: The chosen packing option ID. You can only confirm one option per inbound plan.
Response
operationId: An ID that you can use to check the status of the packing confirmation.
Confirm packing option
Open Recipe
Step 5. Set packing information
Operation
setPackingInformation
Parameters
inboundPlanId: ID of the inbound plan.
packingGroupId: ID for each packing group within the chosen packing option.
boxes: Includes box contents source, box dimensions (weight and quantity), items with prep info, and item quantities matching the inbound plan.
Response
operationId: An ID that you can use to check the status of the API call.
Request example
JSON

{
  "packageGroupings": [
    {
      "boxes": [
        {
          "contentInformationSource": "BOX_CONTENT_PROVIDED",
          "dimensions": {
            "height": 10,
            "length": 10,
            "unitOfMeasurement": "IN",
            "width": 10
          },
          "quantity": 1,
          "weight": {
            "unit": "LB",
            "value": 2
          },
          "items": [
            {
              "labelOwner": "AMAZON",
              "msku": "SKU12345",
              "prepOwner": "AMAZON",
              "quantity": 1
            }
          ]
        }
      ],
      "packingGroupId": "pg1xxxxxxxxxxxxxxxxxxx"
    },
    {
      "boxes": [
        {
          "contentInformationSource": "BOX_CONTENT_PROVIDED",
          "dimensions": {
            "height": 10,
            "length": 10,
            "unitOfMeasurement": "IN",
            "width": 10
          },
          "quantity": 1,
          "weight": {
            "unit": "LB",
            "value": 1
          },
          "items": [
            {
              "labelOwner": "SELLER",
              "msku": "SKU67890",
              "prepOwner": "SELLER",
              "quantity": 1
            }
          ]
        }
      ],
      "packingGroupId": "pg2yyyyyyyyyyyyyyyyyyy"
    }
  ]
}
Set Packing Information
Open Recipe
Step 6. Generate placement options
Operation
generatePlacementOptions

Parameters
inboundPlanId: ID of the inbound plan.
Response
operationId: An ID that you can use to check the status of placement options generation.
Generate packing options
Open Recipe
Step 7. List placement options
Operation
listPlacementOptions
Parameters
inboundPlanId: ID of the inbound plan.
Response
Includes available placementOptions, each represented by a placementOptionId.
Each placementOptionId includes one or more shipmentIds and details on fees or discounts.
📘
Note

Choose only one placement option (placementOptionId).

Response example
JSON

"placementOptions": [
  {
    "fees": [
      {
        "description": "Placement service fee represents service to inbound with minimal shipment splits and destinations of skus",
        "type": "FEE",
        "value": {
          "amount": 1.10,
          "code": "USD"
        },
        "target": "Placement Services"
      }
    ],
    "shipmentIds": [
      "shxxxxxxxxxxxxxxx",
      "shxxxxxxxxxxxxxxx"
    ],
    "discounts": [],
    "expiration": "yyyy-mm-ddT00:00:00.00Z",
    "placementOptionId": "plxxxxxxxxxxxxxxx",
    "status": "OFFERED"
  }
]
The following code sample demonstrates how to choose the least expensive placementOption. Customize this code to fit your own selection criteria.

List placement options
Open Recipe
Step 8. Generate transportation options
Operation
generateTransportationOptions
Parameters
inboundPlanId: ID of the inbound plan.
placementOptionId: The chosen placement option ID.
shipmentTransportationConfigurations: Configuration details including:
shipmentId: Each shipment ID within the chosen placement option. Include all shipment IDs within the selected placement option.
readyToShipWindow: Start date for when shipments are ready for delivery.
freightInformation (only if you want to ship pallets): The declared value and freight class.
pallets (only if you want to ship pallets): Information about the pallets being shipped, including quantity, dimensions, weight, and stackability.
Response
Includes an operationId that you can use to check the status of transportation options generation.
Request example for small parcel delivery
JSON

{
  "placementOptionId": "plxxxxxxxxxxxxxxxxxxxx",
  "shipmentTransportationConfigurations": [
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-ddT00:00:00Z"
      },
      "shipmentId": "sh1xxxxxxxxxxxxxxx"
    },
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-T00:00:00Z"
      },
      "shipmentId": "sh2xxxxxxxxxxxxxx"
    }
  ]
}
Request example for pallet (LTL/FTL) delivery
JSON

{
  "placementOptionId": "plxxxxxxxxxxxxxxxxxxxx",
  "shipmentTransportationConfigurations": [
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-ddT00:00:00Z"
      },
      "shipmentId": "shxxxxxxxxxxxxxxxx",
      "freightInformation": {
        "declaredValue": {
          "amount": 200,
          "code": "USD"
        },
        "freightClass": "FC_XX"
      },
      "pallets": [
        {
          "quantity": 1,
          "dimensions": {
            "height": 48,
            "length": 48,
            "unitOfMeasurement": "IN",
            "width": 40
          },
          "stackability": "STACKABLE",
          "weight": {
            "unit": "LB",
            "value": 600
          }
        }
      ]
    }
  ]
}
Generate Transportation Options
Open Recipe
Step 7. List transportation options
Operation
listTransportationOptions
Parameters
inboundPlanId: The ID of the inbound plan.
placementOptionId: The ID of the chosen placement option.
Response
Includes different available transportationOptions, each represented by transportationOptionId per shipmentId. Each transportation option contains details about:
carrier: Identifies the carrier.
shippingMode: Identifies the shipment type (for example, Small Parcel Delivery or pallets).
shippingSolution: Identifies whether the carrier is Amazon Partnered or your own transportation carrier.
preconditions: Conditions that must be met to provide the delivery window. Only applicable to your own carrier options.
📘
Note

If you have multiple shipmentIds from listPlacementOptions, choose a transportationOptionId for each shipmentId.

To ship using the Amazon Partnered Carrier in this tutorial, you must select the transportationOption based on your shipment type:

For small parcel deliveries, choose the option where shippingMode is GROUND_SMALL_PARCEL.
For pallet shipments, choose the option where shippingMode is FREIGHT_LTL.
In both cases, ensure that shippingSolution is AMAZON_PARTNERED_CARRIER.

Response example for small parcel delivery
JSON

"transportationOptions": [
  {
    "carrier": {
      "name": "United States Postal Service",
      "alphaCode": "USPS"
    },
    "preconditions": [
      "CONFIRMED_DELIVERY_WINDOW"
    ],
    "shipmentId": "shxxxxxxxxxxxxxx",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "transportationOptionId": "toxxxxxxxxxxxxxx",
    "shippingSolution": "USE_YOUR_OWN_CARRIER"
  },
  {
    "carrier": {
      "name": "UPS",
      "alphaCode": "UPSN"
    },
    "quote": {
      "cost": {
        "amount": 19.6,
        "code": "USD"
      }
    },
    "preconditions": [],
    "shipmentId": "shxxxxxxxxxxxxxx",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "transportationOptionId": "toxxxxxxxxxxxxxx",
    "shippingSolution": "AMAZON_PARTNERED_CARRIER"
  }
]
Response example for pallet delivery
JSON

{
  "carrier": {
    "name": "XXXXX",
    "alphaCode": "ABCD"
  },
  "carrierAppointment": {
    "startTime": "2024-10-11T00:00Z",
    "endTime": "2024-10-11T23:59Z"
  },
  "quote": {
    "cost": {
      "amount": 326.54,
      "code": "USD"
    },
    "expiration": "2024-10-09T22:40Z"
  },
  "preconditions": [],
  "shipmentId": "shxxxxxxxxxxxxxx",
  "shippingMode": "FREIGHT_LTL",
  "transportationOptionId": "toxxxxxxxxxxxxxx",
  "shippingSolution": "AMAZON_PARTNERED_CARRIER"
}
List transportation options
Open Recipe
Step 8. Get shipment
Operation
getShipment
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the shipment for which to retrieve details.
Response
Includes the source address from which the shipment originates.
Includes the destination warehouse address for the shipment.
Includes the current status of the shipment.
📘
Note

If you are not satisfied with the chosen options, you can regenerate and select another placement option or transportation option before final confirmation. 

### generateDeliveryWindowOptions
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/deliveryWindowOptions \
     --header 'accept: application/json'
{
  "operationId": "string"
}
generateDeliveryWindowOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions


Generates available delivery window options for a given shipment.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
The shipment to generate delivery window options for.setPackingInformation



### Create a shipment with a non-partnered carrier
 Create a shipment with a non-partnered carrier
Learn how to inbound small parcel deliveries or pallets with non-partnered carriers.

Learn how to inbound Small Parcel Deliveries (SPD) or pallets (LTL/FTL) with a non-partnered carrier using the Fulfillment Inbound API.

Diagram of non-partnered carrier workflow

As a supplement to this guide, the FBA Inbound Sample Solution Code App provides all required resources to deploy a fully functional SP-API application that implements the new Fulfillment Inbound API v2024-03-20.

Step 1. Create an inbound plan
Operation
createInboundPlan
Parameters
destinationMarketplaces: List of marketplaces where the items are sent.
sourceAddress: The address from which the items are shipped.
items: A list of items to include in the inbound plan. Each item should have the following attributes:
prepOwner: The one responsible for prepping the item.
labelOwner: The one responsible for the labeling process.
msku: The Merchant Stock Keeping Unit (SKU) for the item.
quantity: The quantity of items to ship.
Response
operationId: An ID that you can use to check the status of the inbound plan creation.
inboundPlanId: An ID that uniquely identifies the inbound plan.
Create Inbound Plan
Open Recipe
📘
Note

POST operations are asynchronous. Check the status of a POST operation by passing its operationId to getInboundOperationStatus.

Get Inbound operation status
Open Recipe
Step 2. Generate packing options
Operation
generatePackingOptions
Parameters
inboundPlanId: Use the inbound plan ID created in Step 1.
Response
operationId: An ID that you can use to check the status of packing options generation.
Generate packing options
Open Recipe
Step 3. List packing options
Operation
listPackingOptions
Parameters
inboundPlanId: The inbound plan ID.
Response
Includes available packingOptions. Each packingOption has a packingOptionId.
Each packing option contains one or more packingGroups, identified by packingGroupId. Each packing group includes a list of SKUs that should be packed together.
To view SKU items per packingGroupId, call listPackingGroupItems.

📘
Note

Choose only one packing option (packingOptionId).

List packing options
Open Recipe
Step 4. Confirm packing option
Operation
confirmPackingOption
Parameters
inboundPlanId: The ID of the inbound plan.
packingOptionId: The chosen packing option ID. You can only confirm one option per inbound plan.
Response
operationId: An ID that you can use to check the status of the packing confirmation.
Confirm packing option
Open Recipe
Step 5. Set packing information
Operation
setPackingInformation
Parameters
inboundPlanId: ID of the inbound plan.
packingGroupId: ID for each packing group within the chosen packing option.
boxes: Includes box contents source, box dimensions (weight and quantity), items with prep info, and item quantities that match the inbound plan.
Response
operationId: An ID that you can use to check the status of the API call.
Set Packing Information
Open Recipe
Step 6. Generate placement options
Operation
generatePlacementOptions
Parameters
inboundPlanId: ID of the inbound plan.
Response
operationId: An ID that you can use to check the status of placement options generation.
Generate placement options
Open Recipe
Step 7. List placement options
Operation
listPlacementOptions
Parameters
inboundPlanId: ID of the inbound plan.
Response
Includes available placementOptions, each represented by a placementOptionId.
Each placementOptionId includes one or more shipmentIds and details on fees or discounts.
📘
Note

Choose only one placement option (placementOptionId).

Response example
JSON

"placementOptions": [
  {
    "fees": [
      {
        "description": "Placement service fee represents service to inbound with minimal shipment splits and destinations of skus",
        "type": "FEE",
        "value": {
          "amount": 1.10,
          "code": "USD"
        },
        "target": "Placement Services"
      }
    ],
    "shipmentIds": [
      "shxxxxxxxxxxxxxxx"
    ],
    "discounts": [],
    "expiration": "yyyy-mm-ddT00:00:00.00Z",
    "placementOptionId": "plxxxxxxxxxxxxxxx",
    "status": "OFFERED"
  }
]
The following code sample shows how to calculate and choose the least expensive placementOption. You can modify the code to have your own selection criteria.

List placement options
Open Recipe
Step 8. Generate transportation options
Operation
generateTransportationOptions
Parameters
inboundPlanId: ID of the inbound plan.
placementOptionId: Chosen placement option ID.
shipmentTransportationConfigurations: Configuration details, which include:
shipmentId: Each shipment ID within the chosen placement option. Include all shipment IDs within the selected placement option.
readyToShipWindow: Start date for when shipments are ready for delivery.
freightInformation (only if you want to ship pallets): Declared value and freight class.
pallets (only if you want to ship pallets): Information about the shipped pallets, including quantity, dimensions, weight, and stackability.
Response
operationId: An ID that you can use to check the status of transportation options generation.
Request example for small parcel delivery
JSON

{
  "placementOptionId": "plxxxxxxxxxxxxxxxxxxxx",
  "shipmentTransportationConfigurations": [
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-ddT00:00:00Z"
      },
      "shipmentId": "shxxxxxxxxxxxxxxxxxxxx",
      "contactInformation": {
        "name": "xxxxxxxx",
        "phoneNumber": "1234567890",
        "email": "test@email.com"
      }
    }
  ]
}
Request example for pallet delivery
JSON

{
  "placementOptionId": "plxxxxxxxxxxxxxxxxxxxx",
  "shipmentTransportationConfigurations": [
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-ddT00:00:00Z"
      },
      "shipmentId": "shxxxxxxxxxxxxxxxx",
      "contactInformation": {
        "name": "TestName",
        "phoneNumber": "1234567890",
        "email": "test@email.com"
      },
      "freightInformation": {
        "declaredValue": {
          "amount": 200,
          "code": "USD"
        },
        "freightClass": "FC_XX"
      },
      "pallets": [
        {
          "quantity": 1,
          "dimensions": {
            "height": 48,
            "length": 48,
            "unitOfMeasurement": "IN",
            "width": 40
          },
          "stackability": "STACKABLE",
          "weight": {
            "unit": "LB",
            "value": 600
          }
        }
      ]
    }
  ]
}
Generate Transportation Options
Open Recipe
Step 9. List transportation options
Operation
listTransportationOptions
Parameters
inboundPlanId: The ID of the inbound plan.
placementOptionId: The ID of the chosen placement option.
Response
Includes different available transportationOptions, each represented by transportationOptionId per shipmentId. Each transportation option contains details about:
carrier: The carrier.
shippingMode: The shipment type (for example, Small Parcel Delivery vs. pallets).
shippingSolution: The shipping solution. Identifies whether the carrier is Amazon Partnered or your own transportation carrier.
preconditions: Conditions that must be met to provide the delivery window. Only applicable to your own carrier options.
📘
Note

If you have multiple shipmentIds from listPlacementOptions, choose a transportationOptionId for each shipmentId.

To ship using a non-partnered carrier, you must select the transportationOption based on your shipment type:

For small parcel deliveries, choose the option where shippingMode is GROUND_SMALL_PARCEL.
For pallet shipments, choose the option where shippingMode is FREIGHT_LTL.
In both cases, ensure that shippingSolution is USE_YOUR_OWN_CARRIER.
preconditions lists the requirements for confirming the delivery windows. You must generate, list, and confirm a delivery window for each shipment that you send using your own carrier. Follow the tutorial for detailed steps.
Response example for small parcel delivery
JSON

"transportationOptions": [
  {
    "carrier": {
      "name": "United States Postal Service",
      "alphaCode": "USPS"
    },
    "preconditions": [
      "CONFIRMED_DELIVERY_WINDOW"
    ],
    "shipmentId": "shxxxxxxxxxxxxxx",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "transportationOptionId": "toxxxxxxxxxxxxxx",
    "shippingSolution": "USE_YOUR_OWN_CARRIER"
  },
  {
    "carrier": {
      "name": "UPS",
      "alphaCode": "UPSN"
    },
    "quote": {
      "cost": {
        "amount": 19.6,
        "code": "USD"
      }
    },
    "preconditions": [],
    "shipmentId": "shxxxxxxxxxxxxxx",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "transportationOptionId": "toxxxxxxxxxxxxxx",
    "shippingSolution": "AMAZON_PARTNERED_CARRIER"
  }
]
Response example for pallet delivery
JSON

{
  "carrier": {
    "name": "XXXX",
    "alphaCode": "ABCD"
  },
  "preconditions": [
    "CONFIRMED_DELIVERY_WINDOW"
  ],
  "shipmentId": "shxxxxxxxxxxxxxx",
  "shippingMode": "FREIGHT_LTL",
  "transportationOptionId": "toxxxxxxxxxxxxxx",
  "shippingSolution": "USE_YOUR_OWN_CARRIER"
}
List transportation options (non-PCP)
Open Recipe
Step 10. Generate delivery window options
Operation
generateDeliveryWindowOptions
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the specific shipment for which to generate delivery windows.
Response
operationId: An ID that you can use to check the status of the delivery window options generation.
📘
Note

You must generate delivery windows for all shipmentIds within the inbound plan.

Generate delivery window options
Open Recipe
Step 11. List Delivery Window Options
Operation
listDeliveryWindowOptions
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the specific shipment for which to retrieve delivery window options.
Response
Includes a list of available deliveryWindowOptions, each represented by a deliveryWindowOptionId.
Each option includes startDate and endDate that indicate the time frame during which the shipment must arrive.
📘
Note

You must schedule your shipment delivery within 45 days for domestic shipments and 75 days for international shipments. These time frames are reflected in the available delivery window options endDate. For non-partnered carriers, sellers must specify a delivery window of 7 days for domestic shipments or 14 days for international shipments.

The following code sample shows how to choose the delivery window option with the latest endDate. You can modify the code to have your own selection criteria.

List delivery window options
Open Recipe
Step 12. Get shipment
Operation
getShipment
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the specific shipment for which to retrieve details.
Response
Includes the details related to the contents of the specified shipment, including:
Source address: The address from which the shipment originates.
Destination warehouse address: The address of the chosen destination warehouse.
Status: The current status of the shipment.
📘
Note

Before you confirm the placement and transportation options, call getShipment for each shipmentId to ensure all details are satisfactory. If you are not satisfied with your chosen options, you have the option to re-generate and select another placement option or transportation option.

Get shipment details
Open Recipe
Step 13. Confirm placement option
Operation
confirmPlacementOption
Parameters
inboundPlanId: ID of the inbound plan.
placementOptionId: The chosen placement option ID to confirm.
Response
operationId: An ID that you can use to check the status of the placement confirmation.
📘
Note

You can only confirm one placement option per inbound plan.

Confirm placement option
Open Recipe
Step 14. Confirm delivery window options
Operation
confirmDeliveryWindowOptions
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the specific shipment for which the delivery window option is being confirmed.
deliveryWindowOptionId: ID of the chosen delivery window option.
Response
operationId: An ID that you can use to check the status of the delivery window confirmation.
📘
Note

You must confirm delivery windows for every shipmentId in the inbound plan. You can only confirm one delivery window option per shipment for the inbound plan.

Confirm delivery window options
Open Recipe
Step 15. Confirm transportation options
Operation
confirmTransportationOptions
Parameters
inboundPlanId: ID of the inbound plan.
transportationSelections: A list of selected transportation options for each shipment, including:
shipmentId: The ID of the shipment.
transportationOptionId: The chosen transportation option ID for that shipment.
Response
operationId: An ID that you can use to check the status of the transportation confirmation.
Confirm transportation option
Open Recipe
Step 16. Get shipment
Operation
getShipment
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: The ID of the shipment.
Response
Includes the details of shipment, including:
sourceAddress: The origin address of the shipment.
destinationWarehouseAddress: The address of the destination warehouse.
amazonReferenceId: Amazon's reference ID for the shipment.
selectedTransportationOptionId: The chosen transportation option ID.
placementOptionId: The ID of the chosen placement option.
shipmentConfirmationId: The ID that confirms the shipment.
trackingDetails: Information regarding the shipment tracking.
status: The current status of the shipment.
📘
Note

If your inbound plan includes multiple shipment IDs, call getShipment for each shipment ID.

Get shipment details
Open Recipe
Step 17. Get labels
Operation
getLabels
Parameters
shipmentConfirmationId: The ID confirming the shipment, retrieved from the getShipment response.
PageType: Specifies the type of page for the labels.
LabelType: Specifies the type of label to retrieve.
For Pallet Shipments:

NumberOfPallets: The total number of pallets included in the shipment.
PageSize: Specifies the size of the label pages to retrieve.
Response
Includes a URL that you can use to download the labels associated with each shipment ID within your inbound plan.
📘
Note

Call getLabels for each shipment ID and provide the necessary parameters based on whether the shipment is a small parcel delivery or involves pallets.

Get labels to print
Open Recipe
Step 18. List inbound plan boxes
Operation
listInboundPlanBoxes
Parameters
inboundPlanId: ID of the inbound plan.
Response
Includes a list of box package-level information for the specified inbound plan, including box-level information including box IDs, package IDs, box weights, quantities, dimensions, items etc.
List Inbound plan boxes
Open Recipe
Step 19. [Only for pallet shipments] List inbound plan pallets
Call listInboundPlanPallets to retrieve the list of pallet packages per inbound plan. Input should include the inboundPlanId and the response includes all the pallet level information including packageId, dimensions, stackability, etc.

Operation
listInboundPlanPallets
Parameters
inboundPlanId: ID of the inbound plan.
Response
Includes a list of pallet package information for the specified inbound plan, including the package ID, dimensions, stackability, etc.
Step 20. Update shipment tracking details
Operation
updateShipmentTrackingDetails
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the shipment.
trackingDetails: Details for updating tracking information based on shipment type.
For Small Parcel Delivery (SPD):
spdTrackingItems: A list that includes:
boxId: The unique identifier for each box obtained from the listInboundPlanBoxes API.
trackingId: The tracking ID provided by your carrier for each box.
You must update the tracking IDs for all of the boxes within your inbound plan.
For pallet (LTL/FTL) delivery:
ltlTrackingDetail: Details that include the freightBillNumber that your carrier provides for the pallet shipment.
Response
operationId: An ID that you can use to check the status of the tracking details update.
Request example for small parcel delivery
JSON

{
  "trackingDetails": {
    "spdTrackingDetail": {
      "spdTrackingItems": [
        {
          "boxId": "FBAxxxxxxxxxxxxxxx",
          "trackingId": "{{trackingId}}"
        }
      ]
    }
  }
}
Request example for pallet delivery
JSON

{
  "trackingDetails": {
    "ltlTrackingDetail": {
      "freightBillNumber": [
        "{{freightBillNumber}}"
      ]
    }
  }
}
Update shipment tracking details
Open Recipe
This tutorial creates an inbound plan and sends your SKUs as individual boxes (small parcel delivery) or pallets (LTL/FTL) using your own transportation carrier. You can verify this inbound plan on Seller Central with Send to Amazon. 
### confirmDeliveryWindowOptions
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/deliveryWindowOptions/deliveryWindowOptionId/confirmation \
     --header 'accept: application/json'
{
  "operationId": "1234abcd-1234-abcd-5678-1234abcd5678"
}
onfirmDeliveryWindowOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryWindowOptions/{deliveryWindowOptionId}/confirmation


Confirms the delivery window option for chosen shipment within an inbound plan. A placement option must be confirmed prior to use of this API. Once confirmed, new delivery window options cannot be generated, but the chosen delivery window option can be updated before shipment closure. The window is used to provide the expected time when a shipment will arrive at the warehouse. All transportation options which have the program CONFIRMED_DELIVERY_WINDOW require a delivery window to be confirmed prior to transportation option confirmation.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
The shipment to confirm the delivery window option for.

deliveryWindowOptionId
string
required
length between 36 and 38
The id of the delivery window option to be confirmed.

Responses

202
ConfirmDeliveryWindowOptions 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### confirmTransportationOptions
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/transportationOptions/confirmation \
     --header 'accept: application/json' \
     --header 'content-type: application/json'

 {
  "operationId": "string"
}Selling Partner API

confirmTransportationOptions
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions/confirmation


Confirms all the transportation options for an inbound plan. A placement option must be confirmed prior to use of this API. Once confirmed, new transportation options can not be generated or confirmed for the Inbound Plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Body Params

Expand All
⬍
The body of the request to confirmTransportationOptions.

transportationSelections
array of objects
required
length ≥ 1
Information needed to confirm one of the available transportation options.


object

contactInformation
object
The seller's contact information.


contactInformation object
shipmentId
string
required
length between 38 and 38
Shipment ID that the transportation Option is for.

transportationOptionId
string
required
length between 38 and 38
Transportation option being selected for the provided shipment.


ADD object
    

### createInboundPlan
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "items": [
    {
      "labelOwner": "AMAZON",
      "prepOwner": "AMAZON"
    }
  ]
}
{
  "inboundPlanId": "string",
  "operationId": "string"
}
createInboundPlan
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans


Creates an inbound plan. An inbound plan contains all the necessary information to send shipments into Amazon's fufillment network.

Body Params

Expand All
⬍
The body of the request to createInboundPlan.

destinationMarketplaces
array of strings
required
length between 1 and 1
Marketplaces where the items need to be shipped to. Currently only one marketplace can be selected in this request.


string

items
array of objects
required
length between 1 and 2000
Items included in this plan.


object

expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with pattern YYYY-MM-DD. Items with the same MSKU but different expiration dates cannot go into the same box.

labelOwner
string
enum
required
Specifies who will label the items. Options include AMAZON, SELLER or NONE.

Show Details
AMAZON	Amazon provides the information.
SELLER	Seller provides the information.
NONE	No owner is required for the labelling.

AMAZON
Allowed:

AMAZON

SELLER

NONE
manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier of a specific SKU.

prepOwner
string
enum
required
The owner of the preparations, if special preparations are required.

Show Details
AMAZON	Amazon provides the information.
SELLER	The seller provides the information.
NONE	No owner is required for the preparations.

AMAZON
Allowed:

AMAZON

SELLER

NONE
quantity
integer
required
1 to 500000
The number of units of the specified MSKU that will be shipped.


ADD object
name
string
length between 1 and 40
Name for the Inbound Plan. If one isn't provided, a default name will be provided.

sourceAddress
object
required
Specific details to identify a place.


sourceAddress object
Responses

202
CreateInboundPlan 202 response

Response body
object
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.
 
### listInboundPlanBoxes
 curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/boxes?pageSize=10' \
     --header 'accept: application/json'
     {
  "boxes": [
    {
      "boxId": "string",
      "contentInformationSource": "BOX_CONTENT_PROVIDED",
      "destinationRegion": {
        "countryCode": "string",
        "state": "string",
        "warehouseId": "string"
      },
      "dimensions": {
        "height": 0,
        "length": 0,
        "unitOfMeasurement": "IN",
        "width": 0
      },
      "externalContainerIdentifier": "string",
      "externalContainerIdentifierType": "string",
      "items": [
        {
          "asin": "string",
          "expiration": "string",
          "fnsku": "string",
          "labelOwner": "string",
          "manufacturingLotCode": "string",
          "msku": "string",
          "prepInstructions": [
            {
              "fee": {
                "amount": 0,
                "code": "string"
              },
              "prepOwner": "string",
              "prepType": "string"
            }
          ],
          "quantity": 0
        }
      ],
      "packageId": "string",
      "quantity": 0,
      "templateName": "string",
      "weight": {
        "unit": "LB",
        "value": 0
      }
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listInboundPlanBoxes
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/boxes


Provides a paginated list of box packages in an inbound plan.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Query Params
pageSize
integer
1 to 1000
Defaults to 10
The number of boxes to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListInboundPlanBoxes 200 response

Response body
object
boxes
array of objects
required
A list of boxes in an inbound plan.

object
boxId
string
length between 1 and 1024
The ID provided by Amazon that identifies a given box. This ID is comprised of the external shipment ID (which is generated after transportation has been confirmed) and the index of the box.

contentInformationSource
string
enum
Indication of how box content is meant to be provided.

BOX_CONTENT_PROVIDED MANUAL_PROCESS BARCODE_2D

Show Details
BOX_CONTENT_PROVIDED	Box contents have been provided by the seller.
MANUAL_PROCESS	Box contents will be manually processed during receive. This service incurs charges.
BARCODE_2D	Box contents information is provided by a barcode on the shipment. For more information, refer to [Using 2D barcodes for box content information](https://sellercentral.amazon.com/help/hub/reference/GJWALJCN6JKWJX5A) on Seller Central.
destinationRegion
object
Representation of a location used within the inbounding experience.


destinationRegion object
dimensions
object
Measurement of a package's dimensions.


dimensions object
externalContainerIdentifier
string
length between 1 and 1024
The external identifier for this container / box.

externalContainerIdentifierType
string
length between 1 and 1024
Type of the external identifier used. Can be: AMAZON, SSCC.

items
array of objects
Items contained within the box.

object
asin
string
required
length between 1 and 10
The Amazon Standard Identification Number (ASIN) of the item.

expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with patternYYYY-MM-DD. The same MSKU with different expiration dates cannot go into the same box.

fnsku
string
required
length between 1 and 10
A unique identifier assigned by Amazon to products stored in and fulfilled from an Amazon fulfillment center.

labelOwner
string
required
length between 1 and 1024
Specifies who will label the items. Options include AMAZON, SELLER, and NONE.

manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant-defined SKU ID.

prepInstructions
array of objects
required
Special preparations that are required for an item.

object
fee
object
The type and amount of currency.


fee object
prepOwner
string
length between 1 and 1024
In some situations, special preparations are required for items and this field reflects the owner of the preparations. Options include AMAZON, SELLER or NONE.

prepType
string
length between 1 and 1024
Type of preparation that should be done.

Possible values: ITEM_LABELING, ITEM_BUBBLEWRAP, ITEM_POLYBAGGING, ITEM_TAPING, ITEM_BLACK_SHRINKWRAP, ITEM_HANG_GARMENT, ITEM_BOXING, ITEM_SETCREAT, ITEM_RMOVHANG, ITEM_SUFFOSTK, ITEM_CAP_SEALING, ITEM_DEBUNDLE, ITEM_SETSTK, ITEM_SIOC, ITEM_NO_PREP, ADULT, BABY, TEXTILE, HANGER, FRAGILE, LIQUID, SHARP, SMALL, PERFORATED, GRANULAR, SET, FC_PROVIDED, UNKNOWN, NONE.

quantity
integer
required
1 to 500000
The number of the specified MSKU.

packageId
string
required
length between 38 and 38
Primary key to uniquely identify a Package (Box or Pallet).

quantity
integer
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

templateName
string
length between 1 and 1024
Template name of the box.

weight
object
The weight of a package.


weight object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


 ### listInboundPlanPallets
 
 curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/pallets?pageSize=10' \
     --header 'accept: application/json'
  {
  "pagination": {
    "nextToken": "string"
  },
  "pallets": [
    {
      "dimensions": {
        "height": 0,
        "length": 0,
        "unitOfMeasurement": "IN",
        "width": 0
      },
      "packageId": "string",
      "quantity": 0,
      "stackability": "STACKABLE",
      "weight": {
        "unit": "LB",
        "value": 0
      }
    }
  ]
}
listInboundPlanPallets
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/pallets


Provides a paginated list of pallet packages in an inbound plan. An inbound plan will have pallets when the related details are provided after generating Less-Than-Truckload (LTL) carrier shipments.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Query Params
pageSize
integer
1 to 1000
Defaults to 10
The number of pallets to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListInboundPlanPallets 200 response

Response body
object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

pallets
array of objects
required
The pallets in an inbound plan.

object
dimensions
object
Measurement of a package's dimensions.


dimensions object
packageId
string
required
length between 38 and 38
Primary key to uniquely identify a Package (Box or Pallet).

quantity
integer
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

stackability
string
enum
Indicates whether pallets will be stacked when carrier arrives for pick-up.

STACKABLE NON_STACKABLE

Show Details
STACKABLE	A pallet that can be stacked on top of another pallet.
NON_STACKABLE	A pallet that cannot be stacked on top of another pallet.
weight
object
The weight of a package.


weight object
Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


 ### listInboundPlans
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans


Provides a list of inbound plans with minimal information.

Query Params
pageSize
integer
1 to 30
Defaults to 10
The number of inbound plans to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

status
string
enum
The status of an inbound plan.


Allowed:

ACTIVE

VOIDED

SHIPPED
sortBy
string
enum
Sort by field.


Allowed:

LAST_UPDATED_TIME

CREATION_TIME
sortOrder
string
enum
The sort order.


Allowed:

ASC

DESC
Responses

200
ListInboundPlans 200 response

Response body
object
inboundPlans
array of objects
A list of inbound plans with minimal information.

object
createdAt
date-time
required
The time at which the inbound plan was created. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ssZ.

inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

lastUpdatedAt
date-time
required
The time at which the inbound plan was last updated. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ssZ.

marketplaceIds
array of strings
required
A list of marketplace IDs.

name
string
required
Human-readable name of the inbound plan.

sourceAddress
object
required
Specific details to identify a place.


sourceAddress object
status
string
required
length between 1 and 1024
The current status of the inbound plan. Possible values: ACTIVE, VOIDED, SHIPPED, ERRORED.

pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

Updated about 1 month ago

Fulfillment Inbound v2024-03-20
createInboundPlan

### listItemComplianceDetails
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/compliance


List the inbound compliance details for MSKUs in a given marketplace.

Note: MSKUs that contain certain characters must be encoded. For more information, refer to URL Encoding.

The following characters must be double percent encoded:

%
+
,
Examples: An MSKU value of test%msku is encoded as test%2525msku. An MSKU value of test,msku is encoded as test%252Cmsku.

Query Params
mskus
array of strings
required
length between 1 and 100
A list of merchant SKUs, a merchant-supplied identifier of a specific SKU.


string


ADD string
marketplaceId
string
required
length between 1 and 20
The Marketplace ID. For a list of possible values, refer to Marketplace IDs.

Responses

200
ListItemComplianceDetails 200 response

Response body
object
complianceDetails
array of objects
List of compliance details.

object
asin
string
length between 1 and 10
The Amazon Standard Identification Number, which identifies the detail page identifier.

fnsku
string
length between 1 and 10
The Fulfillment Network SKU, which identifies a real fulfillable item with catalog data and condition.

msku
string
length between 1 and 255
The merchant SKU, a merchant-supplied identifier for a specific SKU.

taxDetails
object
Information used to determine the tax compliance.


taxDetails object
Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### listPackingGroupBoxes
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/packingGroups/packingGroupId/boxes?pageSize=10' \
     --header 'accept: application/json'
  {
  "boxes": [
    {
      "boxId": "string",
      "contentInformationSource": "BOX_CONTENT_PROVIDED",
      "destinationRegion": {
        "countryCode": "string",
        "state": "string",
        "warehouseId": "string"
      },
      "dimensions": {
        "height": 0,
        "length": 0,
        "unitOfMeasurement": "IN",
        "width": 0
      },
      "externalContainerIdentifier": "string",
      "externalContainerIdentifierType": "string",
      "items": [
        {
          "asin": "string",
          "expiration": "string",
          "fnsku": "string",
          "labelOwner": "string",
          "manufacturingLotCode": "string",
          "msku": "string",
          "prepInstructions": [
            {
              "fee": {
                "amount": 0,
                "code": "string"
              },
              "prepOwner": "string",
              "prepType": "string"
            }
          ],
          "quantity": 0
        }
      ],
      "packageId": "string",
      "quantity": 0,
      "templateName": "string",
      "weight": {
        "unit": "LB",
        "value": 0
      }
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
 istPackingGroupBoxes
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/packingGroups/{packingGroupId}/boxes


Retrieves a page of boxes from a given packing group. These boxes were previously provided through the setPackingInformation operation. This API is used for workflows where boxes are packed before Amazon determines shipment splits.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

packingGroupId
string
required
length between 38 and 38
Identifier of a packing group.

Query Params
pageSize
integer
1 to 100
Defaults to 10
The number of packing group boxes to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListPackingGroupBoxes 200 response

Response body
object
boxes
array of objects
required
Provides the information about the list of boxes in the packing group.

object
boxId
string
length between 1 and 1024
The ID provided by Amazon that identifies a given box. This ID is comprised of the external shipment ID (which is generated after transportation has been confirmed) and the index of the box.

contentInformationSource
string
enum
Indication of how box content is meant to be provided.

BOX_CONTENT_PROVIDED MANUAL_PROCESS BARCODE_2D

Show Details
BOX_CONTENT_PROVIDED	Box contents have been provided by the seller.
MANUAL_PROCESS	Box contents will be manually processed during receive. This service incurs charges.
BARCODE_2D	Box contents information is provided by a barcode on the shipment. For more information, refer to [Using 2D barcodes for box content information](https://sellercentral.amazon.com/help/hub/reference/GJWALJCN6JKWJX5A) on Seller Central.
destinationRegion
object
Representation of a location used within the inbounding experience.


destinationRegion object
dimensions
object
Measurement of a package's dimensions.


dimensions object
externalContainerIdentifier
string
length between 1 and 1024
The external identifier for this container / box.

externalContainerIdentifierType
string
length between 1 and 1024
Type of the external identifier used. Can be: AMAZON, SSCC.

items
array of objects
Items contained within the box.

object
asin
string
required
length between 1 and 10
The Amazon Standard Identification Number (ASIN) of the item.

expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with patternYYYY-MM-DD. The same MSKU with different expiration dates cannot go into the same box.

fnsku
string
required
length between 1 and 10
A unique identifier assigned by Amazon to products stored in and fulfilled from an Amazon fulfillment center.

labelOwner
string
required
length between 1 and 1024
Specifies who will label the items. Options include AMAZON, SELLER, and NONE.

manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant-defined SKU ID.

prepInstructions
array of objects
required
Special preparations that are required for an item.

object
fee
object
The type and amount of currency.


fee object
prepOwner
string
length between 1 and 1024
In some situations, special preparations are required for items and this field reflects the owner of the preparations. Options include AMAZON, SELLER or NONE.

prepType
string
length between 1 and 1024
Type of preparation that should be done.

Possible values: ITEM_LABELING, ITEM_BUBBLEWRAP, ITEM_POLYBAGGING, ITEM_TAPING, ITEM_BLACK_SHRINKWRAP, ITEM_HANG_GARMENT, ITEM_BOXING, ITEM_SETCREAT, ITEM_RMOVHANG, ITEM_SUFFOSTK, ITEM_CAP_SEALING, ITEM_DEBUNDLE, ITEM_SETSTK, ITEM_SIOC, ITEM_NO_PREP, ADULT, BABY, TEXTILE, HANGER, FRAGILE, LIQUID, SHARP, SMALL, PERFORATED, GRANULAR, SET, FC_PROVIDED, UNKNOWN, NONE.

quantity
integer
required
1 to 500000
The number of the specified MSKU.

packageId
string
required
length between 38 and 38
Primary key to uniquely identify a Package (Box or Pallet).

quantity
integer
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

templateName
string
length between 1 and 1024
Template name of the box.

weight
object
The weight of a package.


weight object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### listPackingGroupItems
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/packingGroups/packingGroupId/items?pageSize=10' \
     --header 'accept: application/json'
{
  "items": [
    {
      "asin": "string",
      "expiration": "string",
      "fnsku": "string",
      "labelOwner": "string",
      "manufacturingLotCode": "string",
      "msku": "string",
      "prepInstructions": [
        {
          "fee": {
            "amount": 0,
            "code": "string"
          },
          "prepOwner": "string",
          "prepType": "string"
        }
      ],
      "quantity": 0
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

packingGroupId
string
required
length between 38 and 38
Identifier of a packing group.

Query Params
pageSize
integer
1 to 100
Defaults to 10
The number of packing group items to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.


### listPackingOptions
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/packingOptions?pageSize=10' \
     --header 'accept: application/json'
  {
  "packingOptions": [
    {
      "discounts": [
        {
          "description": "string",
          "target": "string",
          "type": "string",
          "value": {
            "amount": 0,
            "code": "string"
          }
        }
      ],
      "expiration": "2026-01-11T21:15:38.420Z",
      "fees": [
        {
          "description": "string",
          "target": "string",
          "type": "string",
          "value": {
            "amount": 0,
            "code": "string"
          }
        }
      ],
      "packingGroups": [
        "string"
      ],
      "packingOptionId": "string",
      "status": "string",
      "supportedConfigurations": [
        {
          "boxPackingMethods": [
            "BOX_CONTENT_PROVIDED"
          ],
          "boxRequirements": {
            "weight": {
              "maximum": 0,
              "minimum": 0,
              "unit": "LB"
            }
          },
          "shippingRequirements": [
            {
              "modes": [
                "string"
              ],
              "solution": "string"
            }
          ]
        }
      ],
      "supportedShippingConfigurations": [
        {
          "shippingMode": "string",
          "shippingSolution": "string"
        }
      ]
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listPackingOptions
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/packingOptions


Retrieves a list of all packing options for an inbound plan. Packing options must first be generated by the corresponding operation before becoming available.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Query Params
pageSize
integer
1 to 20
Defaults to 10
The number of packing options to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListPackingOptions 200 response

Response body
object
packingOptions
array of objects
required
List of packing options.

object
discounts
array of objects
required
Discount for the offered option.

object
description
string
required
length between 1 and 1024
Description of the incentive.

target
string
required
length between 1 and 1024
Target of the incentive. Possible values: 'Placement Services', 'Fulfillment Fee Discount'.

type
string
required
length between 1 and 1024
Type of incentive. Possible values: FEE, DISCOUNT.

value
object
required
The type and amount of currency.


value object
expiration
date-time
The time at which this packing option is no longer valid. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ss.sssZ.

fees
array of objects
required
Fee for the offered option.

object
description
string
required
length between 1 and 1024
Description of the incentive.

target
string
required
length between 1 and 1024
Target of the incentive. Possible values: 'Placement Services', 'Fulfillment Fee Discount'.

type
string
required
length between 1 and 1024
Type of incentive. Possible values: FEE, DISCOUNT.

value
object
required
The type and amount of currency.


value object
packingGroups
array of strings
required
Packing group IDs.

packingOptionId
string
required
length between 38 and 38
Identifier of a packing option.

status
string
required
length between 1 and 1024
The status of the packing option. Possible values: OFFERED, ACCEPTED, EXPIRED.

supportedConfigurations
array of objects
required
A list of possible configurations for this option.

object
boxPackingMethods
array of strings
The box content information sources that are allowed.

Show Details
BOX_CONTENT_PROVIDED	Box contents have been provided by the seller.
MANUAL_PROCESS	Box contents will be manually processed during receive. This service incurs charges.
BARCODE_2D	Box contents information is provided by a barcode on the shipment. For more information, refer to [Using 2D barcodes for box content information](https://sellercentral.amazon.com/help/hub/reference/GJWALJCN6JKWJX5A) on Seller Central.
boxRequirements
object
The requirements for a box in the packing option.


boxRequirements object
shippingRequirements
array of objects
A list of supported shipping requirements for this packing configuration.

object
modes
array of strings
required
Available shipment modes for this shipping program.

solution
string
required
length between 1 and 1024
Shipping program for the option. Can be: AMAZON_PARTNERED_CARRIER, USE_YOUR_OWN_CARRIER.

supportedShippingConfigurations
array of objects
required
This field is deprecated. Use the shippingRequirements property under supportedConfigurations instead. List of supported shipping modes.

object
shippingMode
string
length between 1 and 1024
Mode of shipment transportation that this option will provide.

Possible values: GROUND_SMALL_PARCEL, FREIGHT_LTL, FREIGHT_FTL_PALLET, FREIGHT_FTL_NONPALLET, OCEAN_LCL, OCEAN_FCL, AIR_SMALL_PARCEL, AIR_SMALL_PARCEL_EXPRESS.

shippingSolution
string
length between 1 and 1024
Shipping program for the option. Possible values: AMAZON_PARTNERED_CARRIER, USE_YOUR_OWN_CARRIER.

pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


 ### listPlacementOptions
 curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/placementOptions?pageSize=10' \
     --header 'accept: application/json'
  {
  "pagination": {
    "nextToken": "string"
  },
  "placementOptions": [
    {
      "discounts": [
        {
          "description": "string",
          "target": "string",
          "type": "string",
          "value": {
            "amount": 0,
            "code": "string"
          }
        }
      ],
      "expiration": "2026-01-11T21:25:09.478Z",
      "fees": [
        {
          "description": "string",
          "target": "string",
          "type": "string",
          "value": {
            "amount": 0,
            "code": "string"
          }
        }
      ],
      "placementOptionId": "string",
      "shipmentIds": [
        "string"
      ],
      "status": "string"
    }
  ]
}
listPlacementOptions
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/placementOptions


Provides a list of all placement options for an inbound plan. Placement options must first be generated by the corresponding operation before becoming available.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Query Params
pageSize
integer
1 to 20
Defaults to 10
The number of placement options to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListPlacementOptions 200 response

Response body
object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

placementOptions
array of objects
required
Placement options generated for the inbound plan.

object
discounts
array of objects
required
Discount for the offered option.

object
description
string
required
length between 1 and 1024
Description of the incentive.

target
string
required
length between 1 and 1024
Target of the incentive. Possible values: 'Placement Services', 'Fulfillment Fee Discount'.

type
string
required
length between 1 and 1024
Type of incentive. Possible values: FEE, DISCOUNT.

value
object
required
The type and amount of currency.


value object
expiration
date-time
The expiration date of the placement option. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ss.sssZ.

fees
array of objects
required
The fee for the offered option.

object
description
string
required
length between 1 and 1024
Description of the incentive.

target
string
required
length between 1 and 1024
Target of the incentive. Possible values: 'Placement Services', 'Fulfillment Fee Discount'.

type
string
required
length between 1 and 1024
Type of incentive. Possible values: FEE, DISCOUNT.

value
object
required
The type and amount of currency.


value object
placementOptionId
string
required
length between 38 and 38
The identifier of a placement option. A placement option represents the shipment splits and destinations of SKUs.

shipmentIds
array of strings
required
Shipment ids.

status
string
required
length between 1 and 1024
The status of a placement option. Possible values: OFFERED, ACCEPTED, EXPIRED.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.
### updateItemComplianceDetails
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/compliance \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
{
  "operationId": "string"
}
updateItemComplianceDetails
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/compliance


Update compliance details for a list of MSKUs. The details provided here are only used for the India (IN - A21TJRUUN4KGV) marketplace compliance validation.

Query Params
marketplaceId
string
required
length between 1 and 20
The Marketplace ID. For a list of possible values, refer to Marketplace IDs.

Body Params

Expand All
⬍
The body of the request to updateItemComplianceDetails.

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier for a specific SKU.

taxDetails
object
required
Information used to determine the tax compliance.


taxDetails object
Responses

202
UpdateItemComplianceDetails 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### createMarketplaceItemLabels
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/labels \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "labelType": "STANDARD_FORMAT",
  "localeCode": "en_US"
}
{
  "documentDownloads": [
    {
      "downloadType": "string",
      "expiration": "2026-01-11T21:59:33.904Z",
      "uri": "string"
    }
  ]
}
createMarketplaceItemLabels
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/labels


For a given marketplace - creates labels for a list of MSKUs.

Body Params

Expand All
⬍
The body of the request to createMarketplaceItemLabels.

height
number
25 to 100
The height of the item label.

labelType
string
enum
required
Indicates the type of print type for a given label.

Show Details
STANDARD_FORMAT	-
THERMAL_PRINTING	-

STANDARD_FORMAT
Allowed:

STANDARD_FORMAT

THERMAL_PRINTING
localeCode
string
Defaults to en_US
The locale code constructed from ISO 639 language code and ISO 3166-1 alpha-2 standard of country codes separated by an underscore character.

en_US
marketplaceId
string
required
length between 1 and 20
The Marketplace ID. For a list of possible values, refer to Marketplace IDs.

mskuQuantities
array of objects
required
length between 1 and 100
Represents the quantity of an MSKU to print item labels for.


object

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier for a specific SKU.

quantity
integer
required
1 to 10000
A positive integer.


ADD object
pageType
string
enum
The page type to use to print the labels. Possible values: 'A4_21', 'A4_24', 'A4_24_64x33', 'A4_24_66x35', 'A4_24_70x36', 'A4_24_70x37', 'A4_24i', 'A4_27', 'A4_40_52x29', 'A4_44_48x25', 'Letter_30'.

Show Details
A4_21	-
A4_24	-
A4_24_64x33	-
A4_24_66x35	-
A4_24_70x36	-
A4_24_70x37	-
A4_24i	-
A4_27	-
A4_40_52x29	-
A4_44_48x25	-
Letter_30	-

A4_21

Show 11 enum values
width
number
25 to 100
The width of the item label.

Responses

200
CreateMarketplaceItemLabels 200 response

Response body
object
documentDownloads
array of objects
required
Resources to download the requested document.

object
downloadType
string
required
The type of download. Possible values: URL.

expiration
date-time
The URI's expiration time. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ss.sssZ.

uri
string
required
Uniform resource identifier to identify where the document is located.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.



### listPrepDetails
 curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/prepDetails \
     --header 'accept: application/json'
{
  "mskuPrepDetails": [
    {
      "allOwnersConstraint": "MUST_MATCH",
      "labelOwnerConstraint": "AMAZON_ONLY",
      "msku": "string",
      "prepCategory": "ADULT",
      "prepOwnerConstraint": "AMAZON_ONLY",
      "prepTypes": [
        "ITEM_BLACK_SHRINKWRAP"
      ]
    }
  ]
}
listPrepDetails
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/prepDetails


Get preparation details for a list of MSKUs in a specified marketplace.\n\nNote: MSKUs that contain certain characters must be encoded. For more information, refer to URL Encoding.\n\nThe following characters must be double percent encoded:\n\n- %\n- +\n- ,\n\nExamples: An MSKU value of test%msku is encoded as test%2525msku. An MSKU value of test,msku is encoded as test%252Cmsku.

Query Params
marketplaceId
string
required
length between 1 and 20
The marketplace ID. For a list of possible values, refer to Marketplace IDs.

mskus
array of strings
required
length between 1 and 100
A list of merchant SKUs, a merchant-supplied identifier of a specific SKU.


string


ADD string
Responses

200
ListPrepDetails 200 response

Response body
object
mskuPrepDetails
array of objects
required
A list of MSKUs and related prep details.

object
allOwnersConstraint
string
enum
A constraint that applies to all owners. If no constraint is specified, defer to any individual owner constraints.

MUST_MATCH

Show Details
MUST_MATCH	All owners must match.
labelOwnerConstraint
string
enum
A constraint that can apply to an individual owner. If no constraint is specified, both AMAZON and SELLER are acceptable.

AMAZON_ONLY NONE_ONLY SELLER_ONLY

Show Details
AMAZON_ONLY	Only `AMAZON` is accepted as an owner.
NONE_ONLY	Only `NONE` is accepted as an owner.
SELLER_ONLY	Only `SELLER` is accepted as an owner.
msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier for a specific SKU.

prepCategory
string
enum
required
The preparation category for shipping an item to Amazon's fulfillment network.

ADULT BABY FC_PROVIDED FRAGILE GRANULAR HANGER LIQUID PERFORATED SET SHARP SMALL TEXTILE UNKNOWN NONE

Show Details
ADULT	Displays potentially offensive material such as profanity or nudity.
BABY	Made for a child aged three years or younger, packaging with cutouts greater than one square inch.
FC_PROVIDED	A prep type has been defined by the Fulfillment Center. This value is provided by Amazon and cannot be used as an input.
FRAGILE	Glass or otherwise fragile, or a liquid in a glass container.
GRANULAR	Made of powder, pellets, or granular material.
HANGER	Made of cloth or fabric and intended to be put on a hanger.
LIQUID	Liquid or viscous without a double seal.
PERFORATED	In packaging that has a perforated opening.
SET	Multiple items that are sold as one unit.
SHARP	Sharp and easily exposed, not already contained in protective packaging.
SMALL	Longest side less than 2 1/8 inches (width of a credit card).
TEXTILE	Made of cloth or fabric that could be damaged by dirt, dust, moisture, or liquid.
UNKNOWN	An unknown prep category was found and needs to be updated. This value is provided by Amazon and cannot be used as an input.
NONE	Does not require prep.
prepOwnerConstraint
string
enum
A constraint that can apply to an individual owner. If no constraint is specified, both AMAZON and SELLER are acceptable.

AMAZON_ONLY NONE_ONLY SELLER_ONLY

Show Details
AMAZON_ONLY	Only `AMAZON` is accepted as an owner.
NONE_ONLY	Only `NONE` is accepted as an owner.
SELLER_ONLY	Only `SELLER` is accepted as an owner.
prepTypes
array of strings
required
A list of preparation types associated with a preparation category.

Show Details
ITEM_BLACK_SHRINKWRAP	The item requires black shrink wrapping.
ITEM_BLANKSTK	The item requires a blank sticker to obscure a bad barcode that cannot be covered by another sticker.
ITEM_BOXING	Products may require overboxing when there are safety concerns over sharp items, fragile items, hazardous liquids, and vinyl records. For items over 4.5 kg, use double-wall corrugated boxes.
ITEM_BUBBLEWRAP	The item requires bubble wrapping.
ITEM_CAP_SEALING	To prevent leakage, the product needs to have a secondary seal in one of the following types: Induction seal, safety ring, clips, heat shrink plastic band, or boxing.
ITEM_DEBUNDLE	The item requires taking apart a set of items labeled for individual sale. Remove tape or shrink wrap that groups multiple inventory units together.
ITEM_HANG_GARMENT	The item must be placed on a hanger.
ITEM_LABELING	The FNSKU label must be applied to the item.
ITEM_NO_PREP	The item does not require any prep.
ITEM_POLYBAGGING	The item requires polybagging.
ITEM_RMOVHANG	The item cannot be shipped on a hanger.
ITEM_SETCREAT	Units that are sets must be labeled as sets on their packaging. The barcodes on the individual items must not face outward and must not require covering.
ITEM_SETSTK	Products that are sets must be marked as sets on their packaging. Add a label to the unit that clearly states that the products must be received and sold as a single unit. For example, if a set of six unique toy cars is sold as one unit, the packaging for each car must indicate that it is part of the set.
ITEM_SIOC	The item ships in its original product packaging.
ITEM_SUFFOSTK	Poly bags with an opening of 12 cm or larger (measured when flat) must have a suffocation warning. This warning must be printed on the bag or attached as a label.
ITEM_TAPING	Indicates that taping is required.
Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


 ### listShipmentBoxes
 curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/boxes?pageSize=10' \
     --header 'accept: application/json'
  {
  "boxes": [
    {
      "boxId": "string",
      "contentInformationSource": "BOX_CONTENT_PROVIDED",
      "destinationRegion": {
        "countryCode": "string",
        "state": "string",
        "warehouseId": "string"
      },
      "dimensions": {
        "height": 0,
        "length": 0,
        "unitOfMeasurement": "IN",
        "width": 0
      },
      "externalContainerIdentifier": "string",
      "externalContainerIdentifierType": "string",
      "items": [
        {
          "asin": "string",
          "expiration": "string",
          "fnsku": "string",
          "labelOwner": "string",
          "manufacturingLotCode": "string",
          "msku": "string",
          "prepInstructions": [
            {
              "fee": {
                "amount": 0,
                "code": "string"
              },
              "prepOwner": "string",
              "prepType": "string"
            }
          ],
          "quantity": 0
        }
      ],
      "packageId": "string",
      "quantity": 0,
      "templateName": "string",
      "weight": {
        "unit": "LB",
        "value": 0
      }
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listShipmentBoxes
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/boxes


Provides a paginated list of box packages in a shipment.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Query Params
pageSize
integer
1 to 1000
Defaults to 10
The number of boxes to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

### getShipmentContentUpdatePreview
curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/contentUpdatePreviews/contentUpdatePreviewId \
     --header 'accept: application/json'
{
  "contentUpdatePreviewId": "string",
  "expiration": "2026-01-11T21:45:22.789Z",
  "requestedUpdates": {
    "boxes": [
      {
        "contentInformationSource": "BOX_CONTENT_PROVIDED",
        "dimensions": {
          "height": 0,
          "length": 0,
          "unitOfMeasurement": "IN",
          "width": 0
        },
        "items": [
          {
            "expiration": "2024-01-01",
            "labelOwner": "AMAZON",
            "manufacturingLotCode": "manufacturingLotCode",
            "msku": "Sunglasses",
            "prepOwner": "AMAZON",
            "quantity": 10
          }
        ],
        "packageId": "string",
        "quantity": 0,
        "weight": {
          "unit": "LB",
          "value": 0
        }
      }
    ],
    "items": [
      {
        "expiration": "2024-01-01",
        "labelOwner": "AMAZON",
        "manufacturingLotCode": "manufacturingLotCode",
        "msku": "Sunglasses",
        "prepOwner": "AMAZON",
        "quantity": 10
      }
    ]
  },
  "transportationOption": {
    "carrier": {
      "alphaCode": "ABCD",
      "name": "Carrier Name"
    },
    "carrierAppointment": {
      "endTime": "2024-01-06T14:48:00.000Z",
      "startTime": "2024-01-05T14:48:00.000Z"
    },
    "preconditions": [
      "CONFIRMED_DELIVERY_WINDOW"
    ],
    "quote": {
      "cost": {
        "amount": 5.5,
        "code": "CAD"
      },
      "expiration": "2024-01-06T14:48:00.000Z",
      "voidableUntil": "2024-01-05T14:48:00.000Z"
    },
    "shipmentId": "sh1234abcd-1234-abcd-5678-1234abcd5678",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "shippingSolution": "AMAZON_PARTNERED_CARRIER",
    "transportationOptionId": "to1234abcd-1234-abcd-5678-1234abcd5678"
  }
}
getShipmentContentUpdatePreview
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews/{contentUpdatePreviewId}


Retrieve a shipment content update preview which provides a summary of the requested shipment content changes along with the transportation cost implications of the change that can only be confirmed prior to the expiry date specified.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

contentUpdatePreviewId
string
required
length between 38 and 38
Identifier of a content update preview.

Responses

200
GetShipmentContentUpdatePreview 200 response

Response body
object
contentUpdatePreviewId
string
required
length between 38 and 38
Identifier of a content update preview.

expiration
date-time
required
The time at which the content update expires. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ss.sssZ.

requestedUpdates
object
required
Objects that were included in the update request.

boxes
array of objects
A list of boxes that will be present in the shipment after the update.

object
contentInformationSource
string
enum
required
Indication of how box content is meant to be provided.

BOX_CONTENT_PROVIDED MANUAL_PROCESS BARCODE_2D

Show Details
BOX_CONTENT_PROVIDED	Box contents have been provided by the seller.
MANUAL_PROCESS	Box contents will be manually processed during receive. This service incurs charges.
BARCODE_2D	Box contents information is provided by a barcode on the shipment. For more information, refer to [Using 2D barcodes for box content information](https://sellercentral.amazon.com/help/hub/reference/GJWALJCN6JKWJX5A) on Seller Central.
dimensions
object
required
Measurement of a package's dimensions.


dimensions object
items
array of objects
The items and their quantity in the box. This must be empty if the box contentInformationSource is BARCODE_2D or MANUAL_PROCESS.

object
expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with pattern YYYY-MM-DD. Items with the same MSKU but different expiration dates cannot go into the same box.

labelOwner
string
enum
required
Specifies who will label the items. Options include AMAZON, SELLER or NONE.

AMAZON SELLER NONE

Show Details
AMAZON	Amazon provides the information.
SELLER	Seller provides the information.
NONE	No owner is required for the labelling.
manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier of a specific SKU.

prepOwner
string
enum
required
The owner of the preparations, if special preparations are required.

AMAZON SELLER NONE

Show Details
AMAZON	Amazon provides the information.
SELLER	The seller provides the information.
NONE	No owner is required for the preparations.
quantity
integer
required
1 to 500000
The number of units of the specified MSKU that will be shipped.

packageId
string
length between 38 and 38
Primary key to uniquely identify a Box Package. PackageId must be provided if the intent is to update an existing box. Adding a new box will not require providing this value. Any existing PackageIds not provided will be treated as to-be-removed

quantity
integer
required
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

weight
object
required
The weight of a package.


weight object
items
array of objects
A list of all items that will be present in the shipment after the update.

object
expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with pattern YYYY-MM-DD. Items with the same MSKU but different expiration dates cannot go into the same box.

labelOwner
string
enum
required
Specifies who will label the items. Options include AMAZON, SELLER or NONE.

AMAZON SELLER NONE

Show Details
AMAZON	Amazon provides the information.
SELLER	Seller provides the information.
NONE	No owner is required for the labelling.
manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier of a specific SKU.

prepOwner
string
enum
required
The owner of the preparations, if special preparations are required.

AMAZON SELLER NONE

Show Details
AMAZON	Amazon provides the information.
SELLER	The seller provides the information.
NONE	No owner is required for the preparations.
quantity
integer
required
1 to 500000
The number of units of the specified MSKU that will be shipped.

transportationOption
object
required
Contains information pertaining to a transportation option and the related carrier.

carrier
object
required
The carrier for the inbound shipment.


carrier object
carrierAppointment
object
Contains details for a transportation carrier appointment. This appointment is vended out by Amazon and is an indicator for when a transportation carrier is accepting shipments to be picked up.


carrierAppointment object
preconditions
array of strings
required
Identifies a list of preconditions for confirming the transportation option.

quote
object
The estimated shipping cost associated with the transportation option.


quote object
shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

shippingMode
string
required
length between 1 and 1024
Mode of shipment transportation that this option will provide.

Possible values: GROUND_SMALL_PARCEL, FREIGHT_LTL, FREIGHT_FTL_PALLET, FREIGHT_FTL_NONPALLET, OCEAN_LCL, OCEAN_FCL, AIR_SMALL_PARCEL, AIR_SMALL_PARCEL_EXPRESS.

shippingSolution
string
required
length between 1 and 1024
Shipping program for the option. Possible values: AMAZON_PARTNERED_CARRIER, USE_YOUR_OWN_CARRIER.

transportationOptionId
string
required
length between 38 and 38
Identifier of a transportation option. A transportation option represent one option for how to send a shipment.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### confirmShipmentContentUpdatePreview
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/contentUpdatePreviews/contentUpdatePreviewId/confirmation \
     --header 'accept: application/json'
{
  "operationId": "string"
}
confirmShipmentContentUpdatePreview
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews/{contentUpdatePreviewId}/confirmation


Confirm a shipment content update preview and accept the changes in transportation cost.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

contentUpdatePreviewId
string
required
length between 38 and 38
Identifier of a content update preview.

### getDeliveryChallanDocument
curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/deliveryChallanDocument \
     --header 'accept: application/json'
{
  "documentDownload": {
    "downloadType": "string",
    "expiration": "2026-01-11T21:51:03.505Z",
    "uri": "string"
  }
}
getDeliveryChallanDocument
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/deliveryChallanDocument


Provide delivery challan document for PCP transportation in IN marketplace.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.




### generateShipmentContentUpdatePreviews

curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/contentUpdatePreviews \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "boxes": [
    {
      "contentInformationSource": "BOX_CONTENT_PROVIDED",
      "dimensions": {
        "unitOfMeasurement": "IN"
      },
      "weight": {
        "unit": "LB"
      }
    }
  ],
  "items": [
    {
      "labelOwner": "AMAZON",
      "prepOwner": "AMAZON"
    }
  ]
}
{
  "operationId": "string"
}
generateShipmentContentUpdatePreviews
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews


Generate a shipment content update preview given a set of intended boxes and/or items for a shipment with a confirmed carrier. The shipment content update preview will be viewable with the updated costs and contents prior to confirmation.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to generateShipmentContentUpdatePreviews.

boxes
array of objects
required
length between 1 and 5000
A list of boxes that will be present in the shipment after the update.


object

contentInformationSource
string
enum
required
Indication of how box content is meant to be provided.

Show Details
BOX_CONTENT_PROVIDED	Box contents have been provided by the seller.
MANUAL_PROCESS	Box contents will be manually processed during receive. This service incurs charges.
BARCODE_2D	Box contents information is provided by a barcode on the shipment. For more information, refer to [Using 2D barcodes for box content information](https://sellercentral.amazon.com/help/hub/reference/GJWALJCN6JKWJX5A) on Seller Central.

BOX_CONTENT_PROVIDED
Allowed:

BOX_CONTENT_PROVIDED

MANUAL_PROCESS

BARCODE_2D
dimensions
object
required
Measurement of a package's dimensions.


dimensions object
items
array of objects
The items and their quantity in the box. This must be empty if the box contentInformationSource is BARCODE_2D or MANUAL_PROCESS.


ADD object
packageId
string
length between 38 and 38
Primary key to uniquely identify a Box Package. PackageId must be provided if the intent is to update an existing box. Adding a new box will not require providing this value. Any existing PackageIds not provided will be treated as to-be-removed

quantity
integer
required
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

weight
object
required
The weight of a package.


weight object

ADD object
items
array of objects
required
length between 1 and 2000
A list of all items that will be present in the shipment after the update.


object

expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with pattern YYYY-MM-DD. Items with the same MSKU but different expiration dates cannot go into the same box.

labelOwner
string
enum
required
Specifies who will label the items. Options include AMAZON, SELLER or NONE.

Show Details
AMAZON	Amazon provides the information.
SELLER	Seller provides the information.
NONE	No owner is required for the labelling.

AMAZON
Allowed:

AMAZON

SELLER

NONE
manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier of a specific SKU.

prepOwner
string
enum
required
The owner of the preparations, if special preparations are required.

Show Details
AMAZON	Amazon provides the information.
SELLER	The seller provides the information.
NONE	No owner is required for the preparations.

AMAZON
Allowed:

AMAZON

SELLER

NONE
quantity
integer
required
1 to 500000
The number of units of the specified MSKU that will be shipped.


ADD object
Responses

202
GenerateShipmentContentUpdatePreviews 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

###         listShipmentContentUpdatePreviews
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/contentUpdatePreviews?pageSize=10' \
     --header 'accept: application/json'
{
  "contentUpdatePreviews": [
    {
      "contentUpdatePreviewId": "string",
      "expiration": "2026-01-11T21:39:38.504Z",
      "requestedUpdates": {
        "boxes": [
          {
            "contentInformationSource": "BOX_CONTENT_PROVIDED",
            "dimensions": {
              "height": 0,
              "length": 0,
              "unitOfMeasurement": "IN",
              "width": 0
            },
            "items": [
              {
                "expiration": "2024-01-01",
                "labelOwner": "AMAZON",
                "manufacturingLotCode": "manufacturingLotCode",
                "msku": "Sunglasses",
                "prepOwner": "AMAZON",
                "quantity": 10
              }
            ],
            "packageId": "string",
            "quantity": 0,
            "weight": {
              "unit": "LB",
              "value": 0
            }
          }
        ],
        "items": [
          {
            "expiration": "2024-01-01",
            "labelOwner": "AMAZON",
            "manufacturingLotCode": "manufacturingLotCode",
            "msku": "Sunglasses",
            "prepOwner": "AMAZON",
            "quantity": 10
          }
        ]
      },
      "transportationOption": {
        "carrier": {
          "alphaCode": "ABCD",
          "name": "Carrier Name"
        },
        "carrierAppointment": {
          "endTime": "2024-01-06T14:48:00.000Z",
          "startTime": "2024-01-05T14:48:00.000Z"
        },
        "preconditions": [
          "CONFIRMED_DELIVERY_WINDOW"
        ],
        "quote": {
          "cost": {
            "amount": 5.5,
            "code": "CAD"
          },
          "expiration": "2024-01-06T14:48:00.000Z",
          "voidableUntil": "2024-01-05T14:48:00.000Z"
        },
        "shipmentId": "sh1234abcd-1234-abcd-5678-1234abcd5678",
        "shippingMode": "GROUND_SMALL_PARCEL",
        "shippingSolution": "AMAZON_PARTNERED_CARRIER",
        "transportationOptionId": "to1234abcd-1234-abcd-5678-1234abcd5678"
      }
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listShipmentContentUpdatePreviews
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/contentUpdatePreviews


Retrieve a paginated list of shipment content update previews for a given shipment. The shipment content update preview is a summary of the requested shipment content changes along with the transportation cost implications of the change that can only be confirmed prior to the expiry date specified.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Query Params
pageSize
integer
1 to 20
Defaults to 10
The number of content update previews to return.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListShipmentContentUpdatePreviews 200 response

Response body
object
contentUpdatePreviews
array of objects
required
A list of content update previews in a shipment.

object
contentUpdatePreviewId
string
required
length between 38 and 38
Identifier of a content update preview.

expiration
date-time
required
The time at which the content update expires. In ISO 8601 datetime format with pattern yyyy-MM-ddTHH:mm:ss.sssZ.

requestedUpdates
object
required
Objects that were included in the update request.


requestedUpdates object
transportationOption
object
required
Contains information pertaining to a transportation option and the related carrier.


transportationOption object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### listShipmentItems
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/items?pageSize=10' \
     --header 'accept: application/json'

     {
  "items": [
    {
      "asin": "string",
      "expiration": "string",
      "fnsku": "string",
      "labelOwner": "string",
      "manufacturingLotCode": "string",
      "msku": "string",
      "prepInstructions": [
        {
          "fee": {
            "amount": 0,
            "code": "string"
          },
          "prepOwner": "string",
          "prepType": "string"
        }
      ],
      "quantity": 0
    }
  ],
  "pagination": {
    "nextToken": "string"
  }
}
listShipmentItems
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/items


Provides a paginated list of item packages in a shipment.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Query Params
pageSize
integer
1 to 1000
Defaults to 10
The number of items to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListShipmentItems 200 response

Response body
object
items
array of objects
required
The items in a shipment.

object
asin
string
required
length between 1 and 10
The Amazon Standard Identification Number (ASIN) of the item.

expiration
string
The expiration date of the MSKU. In ISO 8601 datetime format with patternYYYY-MM-DD. The same MSKU with different expiration dates cannot go into the same box.

fnsku
string
required
length between 1 and 10
A unique identifier assigned by Amazon to products stored in and fulfilled from an Amazon fulfillment center.

labelOwner
string
required
length between 1 and 1024
Specifies who will label the items. Options include AMAZON, SELLER, and NONE.

manufacturingLotCode
string
length between 1 and 256
The manufacturing lot code.

msku
string
required
length between 1 and 255
The merchant-defined SKU ID.

prepInstructions
array of objects
required
Special preparations that are required for an item.

object
fee
object
The type and amount of currency.


fee object
prepOwner
string
length between 1 and 1024
In some situations, special preparations are required for items and this field reflects the owner of the preparations. Options include AMAZON, SELLER or NONE.

prepType
string
length between 1 and 1024
Type of preparation that should be done.

Possible values: ITEM_LABELING, ITEM_BUBBLEWRAP, ITEM_POLYBAGGING, ITEM_TAPING, ITEM_BLACK_SHRINKWRAP, ITEM_HANG_GARMENT, ITEM_BOXING, ITEM_SETCREAT, ITEM_RMOVHANG, ITEM_SUFFOSTK, ITEM_CAP_SEALING, ITEM_DEBUNDLE, ITEM_SETSTK, ITEM_SIOC, ITEM_NO_PREP, ADULT, BABY, TEXTILE, HANGER, FRAGILE, LIQUID, SHARP, SMALL, PERFORATED, GRANULAR, SET, FC_PROVIDED, UNKNOWN, NONE.

quantity
integer
required
1 to 500000
The number of the specified MSKU.

pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### updateShipmentName
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/name \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
Updates the name of an existing shipment.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to updateShipmentName.

name
string
required
length between 1 and 100
A human-readable name to update the shipment name to.

Responses

204
UpdateShipmentName 204 response

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### listShipmentPallets
 Acurl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/pallets?pageSize=10' \
     --header 'accept: application/json'
  {
  "pagination": {
    "nextToken": "string"
  },
  "pallets": [
    {
      "dimensions": {
        "height": 0,
        "length": 0,
        "unitOfMeasurement": "IN",
        "width": 0
      },
      "packageId": "string",
      "quantity": 0,
      "stackability": "STACKABLE",
      "weight": {
        "unit": "LB",
        "value": 0
      }
    }
  ]
}
listShipmentPallets
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/pallets


Provides a paginated list of pallet packages in a shipment. A palletized shipment will have pallets when the related details are provided after generating Less-Than-Truckload (LTL) carrier shipments.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Query Params
pageSize
integer
1 to 1000
Defaults to 10
The number of pallets to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

Responses

200
ListShipmentPallets 200 response

Response body
object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

pallets
array of objects
required
The pallets in a shipment.

object
dimensions
object
Measurement of a package's dimensions.


dimensions object
packageId
string
required
length between 38 and 38
Primary key to uniquely identify a Package (Box or Pallet).

quantity
integer
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

stackability
string
enum
Indicates whether pallets will be stacked when carrier arrives for pick-up.

STACKABLE NON_STACKABLE

Show Details
STACKABLE	A pallet that can be stacked on top of another pallet.
NON_STACKABLE	A pallet that cannot be stacked on top of another pallet.
weight
object
The weight of a package.


weight object
Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### listTransportationOptions
 curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/transportationOptions?pageSize=10' \
     --header 'accept: application/json'
  {
  "pagination": {
    "nextToken": "string"
  },
  "transportationOptions": [
    {
      "carrier": {
        "alphaCode": "ABCD",
        "name": "Carrier Name"
      },
      "carrierAppointment": {
        "endTime": "2024-01-06T14:48:00.000Z",
        "startTime": "2024-01-05T14:48:00.000Z"
      },
      "preconditions": [
        "CONFIRMED_DELIVERY_WINDOW"
      ],
      "quote": {
        "cost": {
          "amount": 5.5,
          "code": "CAD"
        },
        "expiration": "2024-01-06T14:48:00.000Z",
        "voidableUntil": "2024-01-05T14:48:00.000Z"
      },
      "shipmentId": "sh1234abcd-1234-abcd-5678-1234abcd5678",
      "shippingMode": "GROUND_SMALL_PARCEL",
      "shippingSolution": "AMAZON_PARTNERED_CARRIER",
      "transportationOptionId": "to1234abcd-1234-abcd-5678-1234abcd5678"
    }
  ]
}
listTransportationOptions
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/transportationOptions


Retrieves all transportation options for a shipment. Transportation options must first be generated by the generateTransportationOptions operation before becoming available.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Query Params
pageSize
integer
1 to 20
Defaults to 10
The number of transportation options to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

placementOptionId
string
length between 38 and 38
The placement option to get transportation options for. Either placementOptionId or shipmentId must be specified.

shipmentId
string
length between 38 and 38
The shipment to get transportation options for. Either placementOptionId or shipmentId must be specified.

Responses

200
ListTransportationOptions 200 response

Response body
object
pagination
object
Contains tokens to fetch from a certain page.

nextToken
string
length between 1 and 1024
When present, pass this string token in the next request to return the next response page.

transportationOptions
array of objects
required
Transportation options generated for the placement option.

object
carrier
object
required
The carrier for the inbound shipment.


carrier object
carrierAppointment
object
Contains details for a transportation carrier appointment. This appointment is vended out by Amazon and is an indicator for when a transportation carrier is accepting shipments to be picked up.


carrierAppointment object
preconditions
array of strings
required
Identifies a list of preconditions for confirming the transportation option.

quote
object
The estimated shipping cost associated with the transportation option.


quote object
shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

shippingMode
string
required
length between 1 and 1024
Mode of shipment transportation that this option will provide.

Possible values: GROUND_SMALL_PARCEL, FREIGHT_LTL, FREIGHT_FTL_PALLET, FREIGHT_FTL_NONPALLET, OCEAN_LCL, OCEAN_FCL, AIR_SMALL_PARCEL, AIR_SMALL_PARCEL_EXPRESS.

shippingSolution
string
required
length between 1 and 1024
Shipping program for the option. Possible values: AMAZON_PARTNERED_CARRIER, USE_YOUR_OWN_CARRIER.

transportationOptionId
string
required
length between 38 and 38
Identifier of a transportation option. A transportation option represent one option for how to send a shipment.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### generateSelfShipAppointmentSlots 
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/selfShipAppointmentSlots \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
{
  "operationId": "string"
}
generateSelfShipAppointmentSlots
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots


Initiates the process of generating the appointment slots list. Only available in the following marketplaces: MX, BR, EG, SA, AE, IN.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to generateSelfShipAppointmentSlots.

desiredEndDate
date-time
The desired end date. In ISO 8601 datetime format.

desiredStartDate
date-time
The desired start date. In ISO 8601 datetime format.

Responses

201
GenerateSelfShipAppointmentSlots 201 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### getSelfShipAppointmentSlots
curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/selfShipAppointmentSlots?pageSize=10' \
     --header 'accept: application/json'
{
  "pagination": {
    "nextToken": "string"
  },
  "selfShipAppointmentSlotsAvailability": {
    "expiresAt": "2026-01-11T21:59:15.905Z",
    "slots": [
      {
        "slotId": "string",
        "slotTime": {
          "endTime": "2026-01-11T21:59:15.905Z",
          "startTime": "2026-01-11T21:59:15.905Z"
        }
      }
    ]
  }
}
getSelfShipAppointmentSlots
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots


Retrieves a list of available self-ship appointment slots used to drop off a shipment at a warehouse. Only available in the following marketplaces: MX, BR, EG, SA, AE, IN.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Query Params
pageSize
integer
1 to 100
Defaults to 10
The number of self ship appointment slots to return in the response matching the given query.

10
paginationToken
string
length between 0 and 1024
A token to fetch a certain page when there are multiple pages worth of results. The value of this token is fetched from the pagination returned in the API response. In the absence of the token value from the query parameter the API returns the first page of the result.

### cancelSelfShipAppointment
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/selfShipAppointmentCancellation \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
{
  "operationId": "string"
}
cancelSelfShipAppointment
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentCancellation


Cancels a self-ship appointment slot against a shipment. Only available in the following marketplaces: MX, BR, EG, SA, AE, IN.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to cancelSelfShipAppointment.

reasonComment
string
enum
Reason for cancelling or rescheduling a self-ship appointment.

Show Details
APPOINTMENT_REQUESTED_BY_MISTAKE	-
VEHICLE_DELAY	-
SLOT_NOT_SUITABLE	-
OUTSIDE_CARRIER_BUSINESS_HOURS	-
UNFAVOURABLE_EXTERNAL_CONDITIONS	-
PROCUREMENT_DELAY	-
SHIPPING_PLAN_CHANGED	-
INCREASED_QUANTITY	-
OTHER	-

OTHER

Show 9 enum values

### scheduleSelfShipAppointment
curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/selfShipAppointmentSlots/slotId/schedule \
     --header 'accept: application/json' \
     --header 'content-type: application/json'

  {
  "selfShipAppointmentDetails": {
    "appointmentId": 1000,
    "appointmentSlotTime": {
      "endTime": "2023-03-09T13:15:30Z",
      "startTime": "2023-03-08T13:15:30Z"
    },
    "appointmentStatus": "ARRIVAL_SCHEDULED"
  }
}
scheduleSelfShipAppointment
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/selfShipAppointmentSlots/{slotId}/schedule


Confirms or reschedules a self-ship appointment slot against a shipment. Only available in the following marketplaces: MX, BR, EG, SA, AE, IN.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

slotId
string
required
length between 38 and 38
An identifier to a self-ship appointment slot.

Body Params

Expand All
⬍
The body of the request to scheduleSelfShipAppointment.

reasonComment
string
enum
Reason for cancelling or rescheduling a self-ship appointment.

Show Details
APPOINTMENT_REQUESTED_BY_MISTAKE	-
VEHICLE_DELAY	-
SLOT_NOT_SUITABLE	-
OUTSIDE_CARRIER_BUSINESS_HOURS	-
UNFAVOURABLE_EXTERNAL_CONDITIONS	-
PROCUREMENT_DELAY	-
SHIPPING_PLAN_CHANGED	-
INCREASED_QUANTITY	-
OTHER	-

OTHER

Show 9 enum values
Responses

200
ScheduleSelfShipAppointment 200 response

Response body
object
selfShipAppointmentDetails
object
required
Appointment details for carrier pickup or fulfillment center appointments.

appointmentId
number
Identifier for appointment.

appointmentSlotTime
object
An appointment slot time with start and end.


appointmentSlotTime object
appointmentStatus
string
length between 1 and 1024
Status of the appointment.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### setPackingInformation
 curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/packingInformation \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "packageGroupings": [
    {
      "boxes": [
        {
          "contentInformationSource": "BOX_CONTENT_PROVIDED",
          "dimensions": {
            "unitOfMeasurement": "IN"
          },
          "weight": {
            "unit": "LB"
          }
        }
      ]
    }
  ]
}
{
  "operationId": "string"
}
setPackingInformation
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/packingInformation


Sets packing information for an inbound plan. This should be called after an inbound plan is created to populate the box level information required for planning and transportation estimates.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Body Params

Expand All
⬍
The body of the request to setPackingInformation.

packageGroupings
array of objects
required
length ≥ 1
List of packing information for the inbound plan.


object

boxes
array of objects
required
length between 1 and 5000
Box level information being provided.


object

contentInformationSource
string
enum
required
Indication of how box content is meant to be provided.

Show Details
BOX_CONTENT_PROVIDED	Box contents have been provided by the seller.
MANUAL_PROCESS	Box contents will be manually processed during receive. This service incurs charges.
BARCODE_2D	Box contents information is provided by a barcode on the shipment. For more information, refer to [Using 2D barcodes for box content information](https://sellercentral.amazon.com/help/hub/reference/GJWALJCN6JKWJX5A) on Seller Central.

BOX_CONTENT_PROVIDED
Allowed:

BOX_CONTENT_PROVIDED

MANUAL_PROCESS

BARCODE_2D
dimensions
object
required
Measurement of a package's dimensions.


dimensions object
items
array of objects
The items and their quantity in the box. This must be empty if the box contentInformationSource is BARCODE_2D or MANUAL_PROCESS.


ADD object
quantity
integer
required
1 to 10000
The number of containers where all other properties like weight or dimensions are identical.

weight
object
required
The weight of a package.


weight object

ADD object
packingGroupId
string
length between 38 and 38
The ID of the packingGroup that packages are grouped according to. The PackingGroupId can only be provided before placement confirmation, and it must belong to the confirmed PackingOption. One of ShipmentId or PackingGroupId must be provided with every request.

shipmentId
string
length between 38 and 38
The ID of the shipment that packages are grouped according to. The ShipmentId can only be provided after placement confirmation, and the shipment must belong to the confirmed placement option. One of ShipmentId or PackingGroupId must be provided with every request.


ADD object
Responses

202
SetPackingInformation 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.



### setPrepDetails
 curl --request POST \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/prepDetails \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "mskuPrepDetails": [
    {
      "prepCategory": "ADULT"
    }
  ]
}
RESPONSE {
  "operationId": "string"
}setPrepDetails
post
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/items/prepDetails


Set the preparation details for a list of MSKUs in a specified marketplace.

Body Params

Expand All
⬍
The body of the request to setPrepDetails.

marketplaceId
string
required
length between 1 and 20
The marketplace ID. For a list of possible values, refer to Marketplace IDs.

mskuPrepDetails
array of objects
required
length between 1 and 100
A list of MSKUs and related prep details.


object

msku
string
required
length between 1 and 255
The merchant SKU, a merchant-supplied identifier for a specific SKU.

prepCategory
string
enum
required
The preparation category for shipping an item to Amazon's fulfillment network.

Show Details
ADULT	Displays potentially offensive material such as profanity or nudity.
BABY	Made for a child aged three years or younger, packaging with cutouts greater than one square inch.
FC_PROVIDED	A prep type has been defined by the Fulfillment Center. This value is provided by Amazon and cannot be used as an input.
FRAGILE	Glass or otherwise fragile, or a liquid in a glass container.
GRANULAR	Made of powder, pellets, or granular material.
HANGER	Made of cloth or fabric and intended to be put on a hanger.
LIQUID	Liquid or viscous without a double seal.
PERFORATED	In packaging that has a perforated opening.
SET	Multiple items that are sold as one unit.
SHARP	Sharp and easily exposed, not already contained in protective packaging.
SMALL	Longest side less than 2 1/8 inches (width of a credit card).
TEXTILE	Made of cloth or fabric that could be damaged by dirt, dust, moisture, or liquid.
UNKNOWN	An unknown prep category was found and needs to be updated. This value is provided by Amazon and cannot be used as an input.
NONE	Does not require prep.

ADULT

Show 14 enum values
prepTypes
array of strings
required
A list of preparation types associated with a preparation category.

Show Details
ITEM_BLACK_SHRINKWRAP	The item requires black shrink wrapping.
ITEM_BLANKSTK	The item requires a blank sticker to obscure a bad barcode that cannot be covered by another sticker.
ITEM_BOXING	Products may require overboxing when there are safety concerns over sharp items, fragile items, hazardous liquids, and vinyl records. For items over 4.5 kg, use double-wall corrugated boxes.
ITEM_BUBBLEWRAP	The item requires bubble wrapping.
ITEM_CAP_SEALING	To prevent leakage, the product needs to have a secondary seal in one of the following types: Induction seal, safety ring, clips, heat shrink plastic band, or boxing.
ITEM_DEBUNDLE	The item requires taking apart a set of items labeled for individual sale. Remove tape or shrink wrap that groups multiple inventory units together.
ITEM_HANG_GARMENT	The item must be placed on a hanger.
ITEM_LABELING	The FNSKU label must be applied to the item.
ITEM_NO_PREP	The item does not require any prep.
ITEM_POLYBAGGING	The item requires polybagging.
ITEM_RMOVHANG	The item cannot be shipped on a hanger.
ITEM_SETCREAT	Units that are sets must be labeled as sets on their packaging. The barcodes on the individual items must not face outward and must not require covering.
ITEM_SETSTK	Products that are sets must be marked as sets on their packaging. Add a label to the unit that clearly states that the products must be received and sold as a single unit. For example, if a set of six unique toy cars is sold as one unit, the packaging for each car must indicate that it is part of the set.
ITEM_SIOC	The item ships in its original product packaging.
ITEM_SUFFOSTK	Poly bags with an opening of 12 cm or larger (measured when flat) must have a suffocation warning. This warning must be printed on the bag or attached as a label.
ITEM_TAPING	Indicates that taping is required.

ADD string

ADD object


### updateInboundPlanName
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/name \
     --header 'accept: application/json' \
     --header 'content-type: application/json' 

     Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

Body Params

Expand All
⬍
The body of the request to updateInboundPlanName.

name
string
required
length between 1 and 40
A human-readable name to update the inbound plan name to.


### updateShipmentName
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/name \
     --header 'accept: application/json' \
     --header 'content-type: application/json'

     RESPONSE 204 No Content

    updateShipmentName
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/name


Updates the name of an existing shipment.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to updateShipmentName.

name
string
required
length between 1 and 100
A human-readable name to update the shipment name to.

Responses

204
UpdateShipmentName 204 response

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### updateShipmentSourceAddress
 curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/sourceAddress \
     --header 'accept: application/json' \
     --header 'content-type: application/json'

     {
  "operationId": "string"
}
updateShipmentSourceAddress
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/sourceAddress


Updates the source address of an existing shipment. The shipment source address can only be updated prior to the confirmation of the shipment carriers. As a result of the updated source address, existing transportation options will be invalidated and will need to be regenerated to capture the potential difference in transportation options and quotes due to the new source address.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to updateShipmentSourceAddress.

address
object
required
Specific details to identify a place.


address object
Responses

202
UpdateShipmentSourceAddress 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### updateShipmentSourceAddress
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/sourceAddress \
     --header 'accept: application/json' \
     --header 'content-type: application/json'
{
  "operationId": "string"
}
updateShipmentSourceAddress
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/sourceAddress


Updates the source address of an existing shipment. The shipment source address can only be updated prior to the confirmation of the shipment carriers. As a result of the updated source address, existing transportation options will be invalidated and will need to be regenerated to capture the potential difference in transportation options and quotes due to the new source address.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to updateShipmentSourceAddress.

address
object
required
Specific details to identify a place.


address object


### updateShipmentTrackingDetails
curl --request PUT \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId/trackingDetails \
     --header 'accept: application/json' \
     --header 'content-type: application/json'

     {
  "operationId": "string"
}
updateShipmentTrackingDetails
put
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}/trackingDetails


Updates a shipment's tracking details.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Body Params

Expand All
⬍
The body of the request to updateShipmentTrackingDetails.

trackingDetails
object
required
Tracking information input for Less-Than-Truckload (LTL) and Small Parcel Delivery (SPD) shipments.


trackingDetails object
Responses

202
UpdateShipmentTrackingDetails 202 response

Response body
object
operationId
string
required
length between 36 and 38
UUID for the given operation.

Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### getLabels
 AgetLabels
get
https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/{shipmentId}/labels


Returns package/pallet labels for faster and more accurate shipment processing at the Amazon fulfillment center.

Usage Plan:

Rate (requests per second)	Burst
2	30
The x-amzn-RateLimit-Limit response header returns the usage plan rate limits that were applied to the requested operation, when available. The table above indicates the default rate and burst values for this operation. Selling partners whose business demands require higher throughput may see higher rate and burst values than those shown here. For more information, see Usage Plans and Rate Limits in the Selling Partner API.

Path Params
shipmentId
string
required
A shipment identifier originally returned by the createInboundShipmentPlan operation.

Query Params
PageType
string
enum
required
The page type to use to print the labels. Submitting a PageType value that is not supported in your marketplace returns an error.

Show Details
PackageLabel_Letter_2	Two labels per US Letter label sheet. This is the only valid value for Amazon-partnered shipments in the US that use United Parcel Service (UPS) as the carrier. Supported in Canada and the US.
PackageLabel_Letter_4	Four labels per US Letter label sheet. This is the only valid value for non-Amazon-partnered shipments in the US. Supported in Canada and the US.
PackageLabel_Letter_6	Six labels per US Letter label sheet. This is the only valid value for non-Amazon-partnered shipments in the US. Supported in Canada and the US.
PackageLabel_Letter_6_CarrierLeft	PackageLabel_Letter_6_CarrierLeft
PackageLabel_A4_2	Two labels per A4 label sheet.
PackageLabel_A4_4	Four labels per A4 label sheet.
PackageLabel_Plain_Paper	One label per sheet of US Letter paper. Only for non-Amazon-partnered shipments.
PackageLabel_Plain_Paper_CarrierBottom	PackageLabel_Plain_Paper_CarrierBottom
PackageLabel_Thermal	For use of a thermal printer. Supports Amazon-partnered shipments with UPS.
PackageLabel_Thermal_Unified	For use of a thermal printer. Supports shipments with ATS.
PackageLabel_Thermal_NonPCP	For use of a thermal printer. Supports non-Amazon-partnered shipments.
PackageLabel_Thermal_No_Carrier_Rotation	For use of a thermal printer. Supports Amazon-partnered shipments with DHL.

PackageLabel_Letter_2

Show 12 enum values
LabelType
string
enum
required
The type of labels requested.


BARCODE_2D
Allowed:

BARCODE_2D

UNIQUE

PALLET
NumberOfPackages
integer
The number of packages in the shipment.

PackageLabelsToPrint
array of strings
A list of identifiers that specify packages for which you want package labels printed.

If you provide box content information with the FBA Inbound Shipment Carton Information Feed, then PackageLabelsToPrint must match the CartonId values you provide through that feed. If you provide box content information with the Fulfillment Inbound API v2024-03-20, then PackageLabelsToPrint must match the boxID values from the listShipmentBoxes response. If these values do not match as required, the operation returns the IncorrectPackageIdentifier error code.


ADD string
NumberOfPallets
integer
The number of pallets in the shipment. This returns four identical labels for each pallet.

PageSize
integer
The page size for paginating through the total packages' labels. This is a required parameter for Non-Partnered LTL Shipments. Max value:1000.

PageStartIndex
integer
The page start index for paginating through the total packages' labels. This is a required parameter for Non-Partnered LTL Shipments.

Responses

200
Success.

Response body
object
payload
object
Download URL for a label

DownloadURL
string
URL to download the label for the package. Note: The URL will only be valid for 15 seconds

errors
array of objects
A list of error responses returned when a request is unsuccessful.

object
code
string
required
An error code that identifies the type of error that occured.

message
string
required
A message that describes the error condition in a human-readable form.

details
string
Additional details that can help the caller understand or fix the issue.

Headers
object
x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.

x-amzn-RequestId
string
Unique request reference identifier.


400
Request has missing or invalid parameters and cannot be parsed.


401
The request's Authorization header is not formatted correctly or does not contain a valid token.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The specified resource does not exist.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/shipmentId/labels?PageType=PackageLabel_Letter_2&LabelType=BARCODE_2D' \
     --header 'accept: application/json'
     {
  "payload": {
    "DownloadURL": "string"
  },
  "errors": [
    {
      "code": "string",
      "message": "string",
      "details": "string"
    }
  ]
}

### getBillOfLading
 curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/shipmentId/billOfLading \
     --header 'accept: application/json'

  {
  "payload": {
    "DownloadURL": "string"
  },
  "errors": [
    {
      "code": "string",
      "message": "string",
      "details": "string"
    }
  ]
}
getBillOfLading
get
https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/{shipmentId}/billOfLading


Returns a bill of lading for a Less Than Truckload/Full Truckload (LTL/FTL) shipment. The getBillOfLading operation returns PDF document data for printing a bill of lading for an Amazon-partnered Less Than Truckload/Full Truckload (LTL/FTL) inbound shipment.

Usage Plan:

Rate (requests per second)	Burst
2	30
The x-amzn-RateLimit-Limit response header returns the usage plan rate limits that were applied to the requested operation, when available. The table above indicates the default rate and burst values for this operation. Selling partners whose business demands require higher throughput may see higher rate and burst values than those shown here. For more information, see Usage Plans and Rate Limits in the Selling Partner API.

Path Params
shipmentId
string
required
A shipment identifier originally returned by the createInboundShipmentPlan operation.

Responses

200
Success.

Response body
object
payload
object
Download URL for the bill of lading.

DownloadURL
string
URL to download the bill of lading for the package. Note: The URL will only be valid for 15 seconds

errors
array of objects
A list of error responses returned when a request is unsuccessful.

object
code
string
required
An error code that identifies the type of error that occured.

message
string
required
A message that describes the error condition in a human-readable form.

details
string
Additional details that can help the caller understand or fix the issue.

Headers
object
x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.

x-amzn-RequestId
string
Unique request reference identifier.


400
Request has missing or invalid parameters and cannot be parsed.


401
The request's Authorization header is not formatted correctly or does not contain a valid token.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The specified resource does not exist.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.


### getPrepInstructions
 Acurl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/prepInstructions \
     --header 'accept: application/json'

{
  "payload": {
    "SKUPrepInstructionsList": [
      {
        "SellerSKU": "string",
        "ASIN": "string",
        "BarcodeInstruction": "RequiresFNSKULabel",
        "PrepGuidance": "ConsultHelpDocuments",
        "PrepInstructionList": [
          "Polybagging"
        ],
        "AmazonPrepFeesDetailsList": [
          {
            "PrepInstruction": "Polybagging",
            "FeePerUnit": {
              "CurrencyCode": "USD",
              "Value": 0
            }
          }
        ]
      }
    ],
    "InvalidSKUList": [
      {
        "SellerSKU": "string",
        "ErrorReason": "DoesNotExist"
      }
    ],
    "ASINPrepInstructionsList": [
      {
        "ASIN": "string",
        "BarcodeInstruction": "RequiresFNSKULabel",
        "PrepGuidance": "ConsultHelpDocuments",
        "PrepInstructionList": [
          "Polybagging"
        ]
      }
    ],
    "InvalidASINList": [
      {
        "ASIN": "string",
        "ErrorReason": "DoesNotExist"
      }
    ]
  },
  "errors": [
    {
      "code": "string",
      "message": "string",
      "details": "string"
    }
  ]
}
getPrepInstructions
get
https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/prepInstructions


Returns labeling requirements and item preparation instructions to help prepare items for shipment to Amazon's fulfillment network.

Usage Plan:

Rate (requests per second)	Burst
2	30
The x-amzn-RateLimit-Limit response header returns the usage plan rate limits that were applied to the requested operation, when available. The table above indicates the default rate and burst values for this operation. Selling partners whose business demands require higher throughput may see higher rate and burst values than those shown here. For more information, see Usage Plans and Rate Limits in the Selling Partner API.

Query Params
ShipToCountryCode
string
required
The country code of the country to which the items will be shipped. Note that labeling requirements and item preparation instructions can vary by country.

SellerSKUList
array of strings
length ≤ 50
A list of SellerSKU values. Used to identify items for which you want labeling requirements and item preparation instructions for shipment to Amazon's fulfillment network. The SellerSKU is qualified by the Seller ID, which is included with every call to the Seller Partner API.

Note: Include seller SKUs that you have used to list items on Amazon's retail website. If you include a seller SKU that you have never used to list an item on Amazon's retail website, the seller SKU is returned in the InvalidSKUList property in the response.


ADD string
ASINList
array of strings
length ≤ 50
A list of ASIN values. Used to identify items for which you want item preparation instructions to help with item sourcing decisions.

Note: ASINs must be included in the product catalog for at least one of the marketplaces that the seller participates in. Any ASIN that is not included in the product catalog for at least one of the marketplaces that the seller participates in is returned in the InvalidASINList property in the response. You can find out which marketplaces a seller participates in by calling the getMarketplaceParticipations operation in the Selling Partner API for Sellers.


ADD string
Responses

200
Success.

Response body
object
payload
object
Result for the get prep instructions operation

SKUPrepInstructionsList
array of objects
A list of SKU labeling requirements and item preparation instructions.

object
SellerSKU
string
The seller SKU of the item.

ASIN
string
The Amazon Standard Identification Number (ASIN) of the item.

BarcodeInstruction
string
enum
Labeling requirements for the item. For more information about FBA labeling requirements, see the Seller Central Help for your marketplace.

RequiresFNSKULabel CanUseOriginalBarcode MustProvideSellerSKU

Show Details
RequiresFNSKULabel	Indicates that a scannable FBA product label must be applied to the item. Cover any original bar codes on the item.
CanUseOriginalBarcode	Indicates that the item does not require a scannable FBA product label. The original manufacturer's bar code can be used.
MustProvideSellerSKU	Amazon is unable to return labeling requirements. To get labeling requirements for items, call the getPrepInstructions operation.
PrepGuidance
string
enum
Item preparation instructions.

ConsultHelpDocuments NoAdditionalPrepRequired SeePrepInstructionsList

Show Details
ConsultHelpDocuments	Indicates that Amazon is currently unable to determine the preparation instructions for this item. Amazon might be able to provide guidance at a future date, after evaluating the item.
NoAdditionalPrepRequired	Indicates that the item does not require preparation in addition to any item labeling that might be required.
SeePrepInstructionsList	Indicates that the item requires preparation in addition to any item labeling that might be required. See the PrepInstructionList in the response for item preparation instructions.
PrepInstructionList
array of strings
A list of preparation instructions to help with item sourcing decisions.

Show Details
Polybagging	Indicates that polybagging is required.
BubbleWrapping	Indicates that bubble wrapping is required.
Taping	Indicates that taping is required.
BlackShrinkWrapping	Indicates that black shrink wrapping is required.
Labeling	Indicates that the FNSKU label should be applied to the item.
HangGarment	Indicates that the item should be placed on a hanger.
SetCreation	Units that are sets must be labeled as sets on their packaging. The barcodes on the individual items must 1) not face outward and 2) not require covering.
Boxing	Products may require overboxing when there are safety concerns over sharp items, fragile items, hazardous liquids, and vinyl records. For items over 4.5 kg, use double-wall corrugated boxes.
RemoveFromHanger	Indicates that the item cannot be shipped on a hanger.
Debundle	Indicates requiring taking apart a set of items labeled for individual sale. Remove tape or shrink wrap that groups multiple inventory units together.
SuffocationStickering	Poly bags with an opening of 12 cm or larger (measured when flat) must have a suffocation warning. This warning must be printed on the bag or attached as a label.
CapSealing	To prevent leakage, product needs to have a secondary seal in one of the following types: Induction seal, safety ring, clips, heat shrink plastic band, or boxing.
SetStickering	Products that are sets (for example, a set of six unique toy cars that is sold as one unit) must be marked as sets on their packaging. Add a label to the unit that clearly states that the products are to be received and sold as a single unit.
BlankStickering	Indicates applying a blank sticker to obscure a bad barcode that cannot be covered by another sticker.
ShipsInProductPackaging	Indicates that item ships in its original product packaging.
NoPrep	Indicates that the item does not require any prep.
AmazonPrepFeesDetailsList
array of objects
A list of preparation instructions and fees for Amazon to prep goods for shipment.

object
PrepInstruction
string
enum
Preparation instructions for shipping an item to Amazon's fulfillment network. For more information about preparing items for shipment to Amazon's fulfillment network, see the Seller Central Help for your marketplace.

Polybagging BubbleWrapping Taping BlackShrinkWrapping Labeling HangGarment SetCreation Boxing RemoveFromHanger Debundle SuffocationStickering CapSealing SetStickering BlankStickering ShipsInProductPackaging NoPrep

Show Details
Polybagging	Indicates that polybagging is required.
BubbleWrapping	Indicates that bubble wrapping is required.
Taping	Indicates that taping is required.
BlackShrinkWrapping	Indicates that black shrink wrapping is required.
Labeling	Indicates that the FNSKU label should be applied to the item.
HangGarment	Indicates that the item should be placed on a hanger.
SetCreation	Units that are sets must be labeled as sets on their packaging. The barcodes on the individual items must 1) not face outward and 2) not require covering.
Boxing	Products may require overboxing when there are safety concerns over sharp items, fragile items, hazardous liquids, and vinyl records. For items over 4.5 kg, use double-wall corrugated boxes.
RemoveFromHanger	Indicates that the item cannot be shipped on a hanger.
Debundle	Indicates requiring taking apart a set of items labeled for individual sale. Remove tape or shrink wrap that groups multiple inventory units together.
SuffocationStickering	Poly bags with an opening of 12 cm or larger (measured when flat) must have a suffocation warning. This warning must be printed on the bag or attached as a label.
CapSealing	To prevent leakage, product needs to have a secondary seal in one of the following types: Induction seal, safety ring, clips, heat shrink plastic band, or boxing.
SetStickering	Products that are sets (for example, a set of six unique toy cars that is sold as one unit) must be marked as sets on their packaging. Add a label to the unit that clearly states that the products are to be received and sold as a single unit.
BlankStickering	Indicates applying a blank sticker to obscure a bad barcode that cannot be covered by another sticker.
ShipsInProductPackaging	Indicates that item ships in its original product packaging.
NoPrep	Indicates that the item does not require any prep.
FeePerUnit
object
The monetary value.


FeePerUnit object
InvalidSKUList
array of objects
A list of invalid SKU values and the reason they are invalid.

object
SellerSKU
string
The seller SKU of the item.

ErrorReason
string
enum
The reason that the ASIN is invalid.

DoesNotExist InvalidASIN

Show Details
DoesNotExist	Indicates that the ASIN is not included in the Amazon product catalog for any of the marketplaces that the seller participates in.
InvalidASIN	The ASIN is invalid.
ASINPrepInstructionsList
array of objects
A list of item preparation instructions.

object
ASIN
string
The Amazon Standard Identification Number (ASIN) of the item.

BarcodeInstruction
string
enum
Labeling requirements for the item. For more information about FBA labeling requirements, see the Seller Central Help for your marketplace.

RequiresFNSKULabel CanUseOriginalBarcode MustProvideSellerSKU

Show Details
RequiresFNSKULabel	Indicates that a scannable FBA product label must be applied to the item. Cover any original bar codes on the item.
CanUseOriginalBarcode	Indicates that the item does not require a scannable FBA product label. The original manufacturer's bar code can be used.
MustProvideSellerSKU	Amazon is unable to return labeling requirements. To get labeling requirements for items, call the getPrepInstructions operation.
PrepGuidance
string
enum
Item preparation instructions.

ConsultHelpDocuments NoAdditionalPrepRequired SeePrepInstructionsList

Show Details
ConsultHelpDocuments	Indicates that Amazon is currently unable to determine the preparation instructions for this item. Amazon might be able to provide guidance at a future date, after evaluating the item.
NoAdditionalPrepRequired	Indicates that the item does not require preparation in addition to any item labeling that might be required.
SeePrepInstructionsList	Indicates that the item requires preparation in addition to any item labeling that might be required. See the PrepInstructionList in the response for item preparation instructions.
PrepInstructionList
array of strings
A list of preparation instructions to help with item sourcing decisions.

Show Details
Polybagging	Indicates that polybagging is required.
BubbleWrapping	Indicates that bubble wrapping is required.
Taping	Indicates that taping is required.
BlackShrinkWrapping	Indicates that black shrink wrapping is required.
Labeling	Indicates that the FNSKU label should be applied to the item.
HangGarment	Indicates that the item should be placed on a hanger.
SetCreation	Units that are sets must be labeled as sets on their packaging. The barcodes on the individual items must 1) not face outward and 2) not require covering.
Boxing	Products may require overboxing when there are safety concerns over sharp items, fragile items, hazardous liquids, and vinyl records. For items over 4.5 kg, use double-wall corrugated boxes.
RemoveFromHanger	Indicates that the item cannot be shipped on a hanger.
Debundle	Indicates requiring taking apart a set of items labeled for individual sale. Remove tape or shrink wrap that groups multiple inventory units together.
SuffocationStickering	Poly bags with an opening of 12 cm or larger (measured when flat) must have a suffocation warning. This warning must be printed on the bag or attached as a label.
CapSealing	To prevent leakage, product needs to have a secondary seal in one of the following types: Induction seal, safety ring, clips, heat shrink plastic band, or boxing.
SetStickering	Products that are sets (for example, a set of six unique toy cars that is sold as one unit) must be marked as sets on their packaging. Add a label to the unit that clearly states that the products are to be received and sold as a single unit.
BlankStickering	Indicates applying a blank sticker to obscure a bad barcode that cannot be covered by another sticker.
ShipsInProductPackaging	Indicates that item ships in its original product packaging.
NoPrep	Indicates that the item does not require any prep.
InvalidASINList
array of objects
A list of invalid ASIN values and the reasons they are invalid.

object
ASIN
string
The Amazon Standard Identification Number (ASIN) of the item.

ErrorReason
string
enum
The reason that the ASIN is invalid.

DoesNotExist InvalidASIN

Show Details
DoesNotExist	Indicates that the ASIN is not included in the Amazon product catalog for any of the marketplaces that the seller participates in.
InvalidASIN	The ASIN is invalid.
errors
array of objects
A list of error responses returned when a request is unsuccessful.

object
code
string
required
An error code that identifies the type of error that occured.

message
string
required
A message that describes the error condition in a human-readable form.

details
string
Additional details that can help the caller understand or fix the issue.

Headers
object
x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.

x-amzn-RequestId
string
Unique request reference identifier.


400
Request has missing or invalid parameters and cannot be parsed.


401
The request's Authorization header is not formatted correctly or does not contain a valid token.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The specified resource does not exist.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

###getShipment
curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/inboundPlanId/shipments/shipmentId \
     --header 'accept: application/json'
{
  "destination": {
    "destinationType": "AMAZON_OPTIMIZED"
  },
  "freightInformation": {
    "declaredValue": {
      "amount": 5.5,
      "code": "CAD"
    },
    "freightClass": "FC_50"
  },
  "inboundPlanId": "wf1234abcd-1234-abcd-5678-1234abcd5678",
  "placementOptionId": "pl1234abcd-1234-abcd-5678-1234abcd5678",
  "selectedDeliveryWindow": {
    "availabilityType": "AVAILABLE",
    "deliveryWindowOptionId": "dw1234abcd-1234-abcd-5678-1234abcd5678",
    "editableUntil": "2024-01-05T20:00:00.000Z",
    "endDate": "2024-01-05T20:00:00.000Z",
    "startDate": "2024-01-05T14:00:00.000Z"
  },
  "shipmentConfirmationId": "shipmentConfirmationId",
  "shipmentId": "sh1234abcd-1234-abcd-5678-1234abcd5678",
  "source": {
    "sourceType": "SELLER_FACILITY"
  }
}
getShipment
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/inboundPlans/{inboundPlanId}/shipments/{shipmentId}


Provides the full details for a specific shipment within an inbound plan. The transportationOptionId inside acceptedTransportationSelection can be used to retrieve the transportation details for the shipment.

Path Params
inboundPlanId
string
required
length between 38 and 38
Identifier of an inbound plan.

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

Responses

200
GetShipment 200 response

Response body
object
amazonReferenceId
string
length between 1 and 1024
A unique identifier created by Amazon that identifies this Amazon-partnered, Less Than Truckload/Full Truckload (LTL/FTL) shipment.

contactInformation
object
The seller's contact information.

email
string
length between 1 and 1024
The email address.

name
string
required
length between 1 and 50
The contact's name.

phoneNumber
string
required
length between 1 and 20
The phone number.

dates
object
Specifies the date that the seller expects their shipment will be shipped.

readyToShipWindow
object
Contains a start and end DateTime representing a time range.


readyToShipWindow object
destination
object
required
The Amazon fulfillment center address and warehouse ID.

address
object
Specific details to identify a place.


address object
destinationType
string
required
length between 1 and 1024
The type of destination for this shipment. Possible values: AMAZON_OPTIMIZED, AMAZON_WAREHOUSE.

warehouseId
string
length between 1 and 1024
The warehouse that the shipment should be sent to. This can be empty if the destination type is AMAZON_OPTIMIZED.

freightInformation
object
Freight information describes the SKUs that are in transit. Freight carrier options and quotes will only be returned if the freight information is provided.

declaredValue
object
The type and amount of currency.


declaredValue object
freightClass
string
length between 1 and 1024
Freight class.

Possible values: NONE, FC_50, FC_55, FC_60, FC_65, FC_70, FC_77_5, FC_85, FC_92_5, FC_100, FC_110, FC_125, FC_150, FC_175, FC_200, FC_250, FC_300, FC_400, FC_500.

name
string
The name of the shipment.

placementOptionId
string
required
length between 38 and 38
The identifier of a placement option. A placement option represents the shipment splits and destinations of SKUs.

selectedDeliveryWindow
object
Selected delivery window attributes.

availabilityType
string
required
The type of delivery window availability. Values: AVAILABLE, BLOCKED, CONGESTED, DISCOUNTED

deliveryWindowOptionId
string
required
length between 36 and 38
Identifier of a delivery window option. A delivery window option represent one option for when a shipment is expected to be delivered.

editableUntil
date-time
The timestamp at which this Window can no longer be edited.

endDate
date-time
required
The end timestamp of the window.

startDate
date-time
required
The start timestamp of the window.

selectedTransportationOptionId
string
length between 38 and 38
Identifier of a transportation option. A transportation option represent one option for how to send a shipment.

selfShipAppointmentDetails
array of objects
List of self ship appointment details.

object
appointmentId
number
Identifier for appointment.

appointmentSlotTime
object
An appointment slot time with start and end.


appointmentSlotTime object
appointmentStatus
string
length between 1 and 1024
Status of the appointment.

shipmentConfirmationId
string
length between 1 and 1024
The confirmed shipment ID which shows up on labels (for example, FBA1234ABCD).

shipmentId
string
required
length between 38 and 38
Identifier of a shipment. A shipment contains the boxes and units being inbounded.

source
object
required
Specifies the 'ship from' address for the shipment.

address
object
Specific details to identify a place.


address object
sourceType
string
required
length between 1 and 1024
The type of source for this shipment. Possible values: SELLER_FACILITY.

status
string
length between 1 and 1024
The status of a shipment. The state of the shipment will typically start as UNCONFIRMED, then transition to WORKING after a placement option has been confirmed, and then to READY_TO_SHIP once labels are generated.

Possible values: ABANDONED, CANCELLED, CHECKED_IN, CLOSED, DELETED, DELIVERED, IN_TRANSIT, MIXED, READY_TO_SHIP, RECEIVING, SHIPPED, UNCONFIRMED, WORKING

trackingDetails
object
Tracking information for Less-Than-Truckload (LTL) and Small Parcel Delivery (SPD) shipments.

ltlTrackingDetail
object
Contains information related to Less-Than-Truckload (LTL) shipment tracking.


ltlTrackingDetail object
spdTrackingDetail
object
Contains information related to Small Parcel Delivery (SPD) shipment tracking.


spdTrackingDetail object
Headers
object
x-amzn-RequestId
string
Unique request reference identifier.

x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.


400
Request has missing or invalid parameters and cannot be parsed.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The resource specified does not exist.


413
The request size exceeded the maximum accepted size.


415
The request payload is in an unsupported format.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

### getShipments
 getShipments
get
https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments


Returns a list of inbound shipments based on criteria that you specify.

Usage Plan:

Rate (requests per second)	Burst
2	30
The x-amzn-RateLimit-Limit response header returns the usage plan rate limits that were applied to the requested operation, when available. The table above indicates the default rate and burst values for this operation. Selling partners whose business demands require higher throughput may see higher rate and burst values than those shown here. For more information, see Usage Plans and Rate Limits in the Selling Partner API.

Query Params
ShipmentStatusList
array of strings
A list of ShipmentStatus values. Used to select shipments with a current status that matches the status values that you specify.

Show Details
WORKING	The shipment was created by the seller, but has not yet shipped.
READY_TO_SHIP	The seller has printed box labels (for Small parcel shipments) or pallet labels (for Less Than Truckload shipments).
SHIPPED	The shipment was picked up by the carrier.
RECEIVING	The shipment has arrived at the fulfillment center, but not all items have been marked as received.
CANCELLED	The shipment was cancelled by the seller after the shipment was sent to the fulfillment center.
DELETED	The shipment was cancelled by the seller before the shipment was sent to the fulfillment center.
CLOSED	The shipment has arrived at the fulfillment center and all items have been marked as received.
ERROR	There was an error with the shipment and it was not processed by Amazon.
IN_TRANSIT	The carrier has notified the fulfillment center that it is aware of the shipment.
DELIVERED	The shipment was delivered by the carrier to the fulfillment center.
CHECKED_IN	The shipment was checked-in at the receiving dock of the fulfillment center.

ADD string
ShipmentIdList
array of strings
length ≤ 999
A list of shipment IDs used to select the shipments that you want. If both ShipmentStatusList and ShipmentIdList are specified, only shipments that match both parameters are returned.


ADD string
LastUpdatedAfter
date-time
A date used for selecting inbound shipments that were last updated after (or at) a specified time. The selection includes updates made by Amazon and by the seller.

LastUpdatedBefore
date-time
A date used for selecting inbound shipments that were last updated before (or at) a specified time. The selection includes updates made by Amazon and by the seller.

QueryType
string
enum
required
Indicates whether shipments are returned using shipment information (by providing the ShipmentStatusList or ShipmentIdList parameters), using a date range (by providing the LastUpdatedAfter and LastUpdatedBefore parameters), or by using NextToken to continue returning items specified in a previous request.


SHIPMENT
Allowed:

SHIPMENT

DATE_RANGE

NEXT_TOKEN
NextToken
string
A string token returned in the response to your previous request.

MarketplaceId
string
required
A marketplace identifier. Specifies the marketplace where the product would be stored.

Responses

200
Success.

Response body
object
payload
object
Result for the get shipments operation

ShipmentData
array of objects
A list of inbound shipment information.

object
ShipmentId
string
The shipment identifier submitted in the request.

ShipmentName
string
The name for the inbound shipment.

ShipFromAddress
object
required
Specific details to identify a place.


ShipFromAddress object
DestinationFulfillmentCenterId
string
An Amazon fulfillment center identifier created by Amazon.

ShipmentStatus
string
enum
Indicates the status of the inbound shipment. When used with the createInboundShipment operation, WORKING is the only valid value. When used with the updateInboundShipment operation, possible values are WORKING, SHIPPED or CANCELLED.

WORKING SHIPPED RECEIVING CANCELLED DELETED CLOSED ERROR IN_TRANSIT DELIVERED CHECKED_IN

Show Details
WORKING	The shipment was created by the seller, but has not yet shipped.
SHIPPED	The shipment was picked up by the carrier.
RECEIVING	The shipment has arrived at the fulfillment center, but not all items have been marked as received.
CANCELLED	The shipment was cancelled by the seller after the shipment was sent to the fulfillment center.
DELETED	The shipment was cancelled by the seller before the shipment was sent to the fulfillment center.
CLOSED	The shipment has arrived at the fulfillment center and all items have been marked as received.
ERROR	There was an error with the shipment and it was not processed by Amazon.
IN_TRANSIT	The carrier has notified the fulfillment center that it is aware of the shipment.
DELIVERED	The shipment was delivered by the carrier to the fulfillment center.
CHECKED_IN	The shipment was checked-in at the receiving dock of the fulfillment center.
LabelPrepType
string
enum
The type of label preparation that is required for the inbound shipment.

NO_LABEL SELLER_LABEL AMAZON_LABEL

Show Details
NO_LABEL	No label preparation is required. All items in this shipment will be handled as stickerless, commingled inventory.
SELLER_LABEL	Label preparation by the seller is required.
AMAZON_LABEL	Label preparation by Amazon is required. Note: AMAZON_LABEL is available only if you are enrolled in the FBA Label Service. For more information about the FBA Label Service, see the Seller Central Help for your marketplace.
AreCasesRequired
boolean
required
Indicates whether or not an inbound shipment contains case-packed boxes. When AreCasesRequired = true for an inbound shipment, all items in the inbound shipment must be case packed.

ConfirmedNeedByDate
date
Type containing date in string format

BoxContentsSource
string
enum
Where the seller provided box contents information for a shipment.

NONE FEED 2D_BARCODE INTERACTIVE

Show Details
NONE	There is no box contents information for this shipment. Amazon will manually process the box contents information. This may incur a fee.
FEED	Box contents information is provided through the _POST_FBA_INBOUND_CARTON_CONTENTS_ feed.
2D_BARCODE	Box contents information is provided by a barcode on the shipment. For more information, see Using 2D barcodes for box content information on Seller Central.
INTERACTIVE	Box contents information is provided by an interactive source, such as a web tool.
EstimatedBoxContentsFee
object
The manual processing fee per unit and total fee for a shipment.


EstimatedBoxContentsFee object
NextToken
string
When present and not empty, pass this string token in the next request to return the next response page.

errors
array of objects
A list of error responses returned when a request is unsuccessful.

object
code
string
required
An error code that identifies the type of error that occured.

message
string
required
A message that describes the error condition in a human-readable form.

details
string
Additional details that can help the caller understand or fix the issue.

Headers
object
x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.

x-amzn-RequestId
string
Unique request reference identifier.


400
Request has missing or invalid parameters and cannot be parsed.


401
The request's Authorization header is not formatted correctly or does not contain a valid token.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The specified resource does not exist.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

curl --request GET \
     --url 'https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments?QueryType=SHIPMENT' \
     --header 'accept: application/json'
     {
  "payload": {
    "ShipmentData": [
      {
        "ShipmentId": "string",
        "ShipmentName": "string",
        "ShipFromAddress": {
          "Name": "string",
          "AddressLine1": "string",
          "AddressLine2": "string",
          "DistrictOrCounty": "string",
          "City": "string",
          "StateOrProvinceCode": "string",
          "CountryCode": "string",
          "PostalCode": "string"
        },
        "DestinationFulfillmentCenterId": "string",
        "ShipmentStatus": "WORKING",
        "LabelPrepType": "NO_LABEL",
        "AreCasesRequired": true,
        "ConfirmedNeedByDate": "2026-01-11",
        "BoxContentsSource": "NONE",
        "EstimatedBoxContentsFee": {
          "TotalUnits": 0,
          "FeePerUnit": {
            "CurrencyCode": "USD",
            "Value": 0
          },
          "TotalFee": {
            "CurrencyCode": "USD",
            "Value": 0
          }
        }
      }
    ],
    "NextToken": "string"
  },
  "errors": [
    {
      "code": "string",
      "message": "string",
      "details": "string"
    }
  ]
}

### getShipmentItemsByShipmentId
 getShipmentItemsByShipmentId
get
https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/shipments/{shipmentId}/items


Returns a list of items in a specified inbound shipment.

Usage Plan:

Rate (requests per second)	Burst
2	30
The x-amzn-RateLimit-Limit response header returns the usage plan rate limits that were applied to the requested operation, when available. The table above indicates the default rate and burst values for this operation. Selling partners whose business demands require higher throughput may see higher rate and burst values than those shown here. For more information, see Usage Plans and Rate Limits in the Selling Partner API.

Path Params
shipmentId
string
required
A shipment identifier used for selecting items in a specific inbound shipment.

Query Params
MarketplaceId
string
Deprecated. Do not use.

Responses

200
Success.

Response body
object
payload
object
Result for the get shipment items operation

ItemData
array of objects
A list of inbound shipment item information.

object
ShipmentId
string
A shipment identifier originally returned by the createInboundShipmentPlan operation.

SellerSKU
string
required
The seller SKU of the item.

FulfillmentNetworkSKU
string
Amazon's fulfillment network SKU of the item.

QuantityShipped
int32
required
The item quantity.

QuantityReceived
int32
The item quantity.

QuantityInCase
int32
The item quantity.

ReleaseDate
date
Type containing date in string format

PrepDetailsList
array of objects
A list of preparation instructions and who is responsible for that preparation.

object
PrepInstruction
string
enum
required
Preparation instructions for shipping an item to Amazon's fulfillment network. For more information about preparing items for shipment to Amazon's fulfillment network, see the Seller Central Help for your marketplace.

Polybagging BubbleWrapping Taping BlackShrinkWrapping Labeling HangGarment SetCreation Boxing RemoveFromHanger Debundle SuffocationStickering CapSealing SetStickering BlankStickering ShipsInProductPackaging NoPrep

Show Details
Polybagging	Indicates that polybagging is required.
BubbleWrapping	Indicates that bubble wrapping is required.
Taping	Indicates that taping is required.
BlackShrinkWrapping	Indicates that black shrink wrapping is required.
Labeling	Indicates that the FNSKU label should be applied to the item.
HangGarment	Indicates that the item should be placed on a hanger.
SetCreation	Units that are sets must be labeled as sets on their packaging. The barcodes on the individual items must 1) not face outward and 2) not require covering.
Boxing	Products may require overboxing when there are safety concerns over sharp items, fragile items, hazardous liquids, and vinyl records. For items over 4.5 kg, use double-wall corrugated boxes.
RemoveFromHanger	Indicates that the item cannot be shipped on a hanger.
Debundle	Indicates requiring taking apart a set of items labeled for individual sale. Remove tape or shrink wrap that groups multiple inventory units together.
SuffocationStickering	Poly bags with an opening of 12 cm or larger (measured when flat) must have a suffocation warning. This warning must be printed on the bag or attached as a label.
CapSealing	To prevent leakage, product needs to have a secondary seal in one of the following types: Induction seal, safety ring, clips, heat shrink plastic band, or boxing.
SetStickering	Products that are sets (for example, a set of six unique toy cars that is sold as one unit) must be marked as sets on their packaging. Add a label to the unit that clearly states that the products are to be received and sold as a single unit.
BlankStickering	Indicates applying a blank sticker to obscure a bad barcode that cannot be covered by another sticker.
ShipsInProductPackaging	Indicates that item ships in its original product packaging.
NoPrep	Indicates that the item does not require any prep.
PrepOwner
string
enum
required
Indicates who will prepare the item.

AMAZON SELLER

Show Details
AMAZON	Indicates Amazon will prepare the item.
SELLER	Indicates the seller will prepare the item.
NextToken
string
When present and not empty, pass this string token in the next request to return the next response page.

errors
array of objects
A list of error responses returned when a request is unsuccessful.

object
code
string
required
An error code that identifies the type of error that occured.

message
string
required
A message that describes the error condition in a human-readable form.

details
string
Additional details that can help the caller understand or fix the issue.

Headers
object
x-amzn-RateLimit-Limit
string
Your rate limit (requests per second) for this operation.

x-amzn-RequestId
string
Unique request reference identifier.


400
Request has missing or invalid parameters and cannot be parsed.


401
The request's Authorization header is not formatted correctly or does not contain a valid token.


403
Indicates that access to the resource is forbidden. Possible reasons include Access Denied, Unauthorized, Expired Token, or Invalid Signature.


404
The specified resource does not exist.


429
The frequency of requests was greater than allowed.


500
An unexpected condition occurred that prevented the server from fulfilling the request.


503
Temporary overloading or maintenance of the server.

 

## getInboundOperationStatus
curl --request GET \
     --url https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/operations/operationId \
     --header 'accept: application/json'
{
  "operation": "string",
  "operationId": "string",
  "operationProblems": [
    {
      "code": "string",
      "details": "string",
      "message": "string",
      "severity": "string"
    }
  ],
  "operationStatus": "SUCCESS"
}
getInboundOperationStatus
get
https://sellingpartnerapi-na.amazon.com/inbound/fba/2024-03-20/operations/{operationId}


Gets the status of the processing of an asynchronous API call.

Recipes
Get inbound operation status
Open Recipe
Path Params
operationId
string
required
length between 36 and 38
Identifier of an asynchronous operation.



### SPD with Amazon-Partnered Carrier (PCP)
 Create a shipment with an Amazon-partnered carrier (PCP)
Learn how to inbound small parcel deliveries or pallets with Amazon-partnered carriers

Learn how to inbound Small Parcel Deliveries (SPD) or pallets (LTL/FTL) with an Amazon-partnered carrier using the Fulfillment Inbound API.

Diagram of partnered carrier workflow

Step 1. Create an inbound plan
Operation
createInboundPlan
Parameters
destinationMarketplaces: Target marketplaces for shipment.
sourceAddress: Address from which items are shipped.
items:
prepOwner: Preparation owner.
labelOwner: Labeling owner.
msku: Merchant SKU.
itemQuantity: Quantity of items.
Response
Includes inboundPlanId and operationId to check the status of inbound plan creation.
Create Inbound Plan
Open Recipe
📘
Note

POST operations are asynchronous. Check the status of a POST operation by passing its operationId to getInboundOperationStatus.

Get Inbound operation status
Open Recipe
Step 2. Generate packing options
Operation
generatePackingOptions
Parameters
inboundPlanId: Use the inbound plan ID created in Step 1.
Response
operationId: An ID that you can use to check the status of packing options generation.
Generate packing options
Open Recipe
Step 3. List packing options
Operation
listPackingOptions
Parameters
inboundPlanId: Input the inbound plan ID.
Response
Includes available packingOptions. Each packing option is represented by a packingOptionId.
Each packing option contains one or more packingGroups, identified by packingGroupId. Each packing group includes a list of SKUs that should be packed together.
To view the SKU items in a packing group, call listPackingGroupItems with the packing group's packingGroupId.

📘
Note

Choose only one packing option (packingOptionId).

List packing options
Open Recipe
Step 4. Confirm packing option
Operation
confirmPackingOption
Parameters
inboundPlanId: The ID of the inbound plan.
packingOptionId: The chosen packing option ID. You can only confirm one option per inbound plan.
Response
operationId: An ID that you can use to check the status of the packing confirmation.
Confirm packing option
Open Recipe
Step 5. Set packing information
Operation
setPackingInformation
Parameters
inboundPlanId: ID of the inbound plan.
packingGroupId: ID for each packing group within the chosen packing option.
boxes: Includes box contents source, box dimensions (weight and quantity), items with prep info, and item quantities matching the inbound plan.
Response
operationId: An ID that you can use to check the status of the API call.
Request example
JSON

{
  "packageGroupings": [
    {
      "boxes": [
        {
          "contentInformationSource": "BOX_CONTENT_PROVIDED",
          "dimensions": {
            "height": 10,
            "length": 10,
            "unitOfMeasurement": "IN",
            "width": 10
          },
          "quantity": 1,
          "weight": {
            "unit": "LB",
            "value": 2
          },
          "items": [
            {
              "labelOwner": "AMAZON",
              "msku": "SKU12345",
              "prepOwner": "AMAZON",
              "quantity": 1
            }
          ]
        }
      ],
      "packingGroupId": "pg1xxxxxxxxxxxxxxxxxxx"
    },
    {
      "boxes": [
        {
          "contentInformationSource": "BOX_CONTENT_PROVIDED",
          "dimensions": {
            "height": 10,
            "length": 10,
            "unitOfMeasurement": "IN",
            "width": 10
          },
          "quantity": 1,
          "weight": {
            "unit": "LB",
            "value": 1
          },
          "items": [
            {
              "labelOwner": "SELLER",
              "msku": "SKU67890",
              "prepOwner": "SELLER",
              "quantity": 1
            }
          ]
        }
      ],
      "packingGroupId": "pg2yyyyyyyyyyyyyyyyyyy"
    }
  ]
}
Set Packing Information
Open Recipe
Step 6. Generate placement options
Operation
generatePlacementOptions

Parameters
inboundPlanId: ID of the inbound plan.
Response
operationId: An ID that you can use to check the status of placement options generation.
Generate packing options
Open Recipe
Step 7. List placement options
Operation
listPlacementOptions
Parameters
inboundPlanId: ID of the inbound plan.
Response
Includes available placementOptions, each represented by a placementOptionId.
Each placementOptionId includes one or more shipmentIds and details on fees or discounts.
📘
Note

Choose only one placement option (placementOptionId).

Response example
JSON

"placementOptions": [
  {
    "fees": [
      {
        "description": "Placement service fee represents service to inbound with minimal shipment splits and destinations of skus",
        "type": "FEE",
        "value": {
          "amount": 1.10,
          "code": "USD"
        },
        "target": "Placement Services"
      }
    ],
    "shipmentIds": [
      "shxxxxxxxxxxxxxxx",
      "shxxxxxxxxxxxxxxx"
    ],
    "discounts": [],
    "expiration": "yyyy-mm-ddT00:00:00.00Z",
    "placementOptionId": "plxxxxxxxxxxxxxxx",
    "status": "OFFERED"
  }
]
The following code sample demonstrates how to choose the least expensive placementOption. Customize this code to fit your own selection criteria.

List placement options
Open Recipe
Step 8. Generate transportation options
Operation
generateTransportationOptions
Parameters
inboundPlanId: ID of the inbound plan.
placementOptionId: The chosen placement option ID.
shipmentTransportationConfigurations: Configuration details including:
shipmentId: Each shipment ID within the chosen placement option. Include all shipment IDs within the selected placement option.
readyToShipWindow: Start date for when shipments are ready for delivery.
freightInformation (only if you want to ship pallets): The declared value and freight class.
pallets (only if you want to ship pallets): Information about the pallets being shipped, including quantity, dimensions, weight, and stackability.
Response
Includes an operationId that you can use to check the status of transportation options generation.
Request example for small parcel delivery
JSON

{
  "placementOptionId": "plxxxxxxxxxxxxxxxxxxxx",
  "shipmentTransportationConfigurations": [
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-ddT00:00:00Z"
      },
      "shipmentId": "sh1xxxxxxxxxxxxxxx"
    },
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-T00:00:00Z"
      },
      "shipmentId": "sh2xxxxxxxxxxxxxx"
    }
  ]
}
Request example for pallet (LTL/FTL) delivery
JSON

{
  "placementOptionId": "plxxxxxxxxxxxxxxxxxxxx",
  "shipmentTransportationConfigurations": [
    {
      "readyToShipWindow": {
        "start": "yyyy-mm-ddT00:00:00Z"
      },
      "shipmentId": "shxxxxxxxxxxxxxxxx",
      "freightInformation": {
        "declaredValue": {
          "amount": 200,
          "code": "USD"
        },
        "freightClass": "FC_XX"
      },
      "pallets": [
        {
          "quantity": 1,
          "dimensions": {
            "height": 48,
            "length": 48,
            "unitOfMeasurement": "IN",
            "width": 40
          },
          "stackability": "STACKABLE",
          "weight": {
            "unit": "LB",
            "value": 600
          }
        }
      ]
    }
  ]
}
Generate Transportation Options
Open Recipe
Step 7. List transportation options
Operation
listTransportationOptions
Parameters
inboundPlanId: The ID of the inbound plan.
placementOptionId: The ID of the chosen placement option.
Response
Includes different available transportationOptions, each represented by transportationOptionId per shipmentId. Each transportation option contains details about:
carrier: Identifies the carrier.
shippingMode: Identifies the shipment type (for example, Small Parcel Delivery or pallets).
shippingSolution: Identifies whether the carrier is Amazon Partnered or your own transportation carrier.
preconditions: Conditions that must be met to provide the delivery window. Only applicable to your own carrier options.
📘
Note

If you have multiple shipmentIds from listPlacementOptions, choose a transportationOptionId for each shipmentId.

To ship using the Amazon Partnered Carrier in this tutorial, you must select the transportationOption based on your shipment type:

For small parcel deliveries, choose the option where shippingMode is GROUND_SMALL_PARCEL.
For pallet shipments, choose the option where shippingMode is FREIGHT_LTL.
In both cases, ensure that shippingSolution is AMAZON_PARTNERED_CARRIER.

Response example for small parcel delivery
JSON

"transportationOptions": [
  {
    "carrier": {
      "name": "United States Postal Service",
      "alphaCode": "USPS"
    },
    "preconditions": [
      "CONFIRMED_DELIVERY_WINDOW"
    ],
    "shipmentId": "shxxxxxxxxxxxxxx",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "transportationOptionId": "toxxxxxxxxxxxxxx",
    "shippingSolution": "USE_YOUR_OWN_CARRIER"
  },
  {
    "carrier": {
      "name": "UPS",
      "alphaCode": "UPSN"
    },
    "quote": {
      "cost": {
        "amount": 19.6,
        "code": "USD"
      }
    },
    "preconditions": [],
    "shipmentId": "shxxxxxxxxxxxxxx",
    "shippingMode": "GROUND_SMALL_PARCEL",
    "transportationOptionId": "toxxxxxxxxxxxxxx",
    "shippingSolution": "AMAZON_PARTNERED_CARRIER"
  }
]
Response example for pallet delivery
JSON

{
  "carrier": {
    "name": "XXXXX",
    "alphaCode": "ABCD"
  },
  "carrierAppointment": {
    "startTime": "2024-10-11T00:00Z",
    "endTime": "2024-10-11T23:59Z"
  },
  "quote": {
    "cost": {
      "amount": 326.54,
      "code": "USD"
    },
    "expiration": "2024-10-09T22:40Z"
  },
  "preconditions": [],
  "shipmentId": "shxxxxxxxxxxxxxx",
  "shippingMode": "FREIGHT_LTL",
  "transportationOptionId": "toxxxxxxxxxxxxxx",
  "shippingSolution": "AMAZON_PARTNERED_CARRIER"
}
List transportation options
Open Recipe
Step 8. Get shipment
Operation
getShipment
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the shipment for which to retrieve details.
Response
Includes the source address from which the shipment originates.
Includes the destination warehouse address for the shipment.
Includes the current status of the shipment.
📘
Note

If you are not satisfied with the chosen options, you can regenerate and select another placement option or transportation option before final confirmation.

Get shipment details
Open Recipe
Step 9. Confirm placement option
Operation
confirmPlacementOption
Parameters
inboundPlanId: ID of the inbound plan.
placementOptionId: The chosen placement option ID to confirm.
Response
operationId: An ID that you can use to check the status of the placement confirmation.
📘
Note

You can only confirm one placement option per inbound plan.

Confirm placement option
Open Recipe
Step 10. Confirm transportation options
Operation
confirmTransportationOptions
Parameters
inboundPlanId: ID of the inbound plan.
transportationSelections: A list of selected transportation options for each shipment, including:
shipmentId: The ID of the shipment.
transportationOptionId: The chosen transportation option ID for that shipment.
Response
operationId: An ID that you can use to check the status of the transportation confirmation.
Important considerations
If your inbound plan includes multiple shipments:

For small parcel deliveries, ensure that all shipments use the same carrier.
For pallet deliveries, you can choose different carriers for each shipment.
Confirm transportation option
Open Recipe
Step 11. Get shipment
Operation
getShipment
Parameters
inboundPlanId: ID of the inbound plan.
shipmentId: ID of the shipment.
Response
Includes the following details of shipment:
sourceAddress: The origin address of the shipment.
destinationWarehouseAddress: The address of the destination warehouse.
amazonReferenceId: Amazon's reference ID for the shipment.
selectedTransportationOptionId: The chosen transportation option ID.
placementOptionId: The ID of the chosen placement option.
shipmentConfirmationId: The ID confirming the shipment.
trackingDetails: Information regarding the shipment tracking.
status: The current status of the shipment.
📘
Note

If your inbound plan includes multiple shipment IDs, call getShipment for each shipment ID.

Get shipment details
Open Recipe
Step 12. Get labels
Operation
getLabels
Parameters
shipmentConfirmationId: The ID that confirms the shipment, retrieved from the getShipment response.
PageType: Specifies the type of page for the labels.
LabelType: Specifies the type of label to retrieve.
For Pallet Shipments:

NumberOfPallets: The total number of pallets included in the shipment.
PageSize: The size of the label pages to retrieve.
Response
Includes a URL that you can use to download the labels associated with each shipment ID within your inbound plan.
📘
Note

Call getLabels for each shipment ID and provide the necessary parameters based on whether the shipment is a small parcel delivery or involves pallets.

Get labels to print
Open Recipe
[Only for Pallet Shipments] Step 13. Get bill of lading
Operation
getBillOfLading
Parameters
shipmentConfirmationId: The ID that confirms the shipment, retrieved from getShipment response.
Response
Includes a URL that you can use to download the bill of lading associated with the Less Than Truckload (LTL) or Full Truckload (FTL) pallet shipment.
This process completes the creation of your inbound plan, and sends your SKUs as either individual boxes (small parcel delivery) or pallets (LTL/FTL) using the Amazon Partnered Carrier. You can verify this inbound plan through the Seller Central Send to Amazon UI.


