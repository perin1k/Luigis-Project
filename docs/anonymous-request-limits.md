# SEC-01 anonymous API request limits

October 22, 2026. Story: https://trello.com/c/3fVC3XbV.

The anonymous APIs previously bounded individual request bodies but did not limit
repeated requests. `src/security/anonymous-limits.js`, installed by `src/app.js`
before API parsers/services, now limits actual socket peers in fixed 60-second
windows. No additional package or schema is needed.

| Budget per actual peer | Requests per window | Shared routes |
| --- | --- | --- |
| Checkout | 60 | `/api/orders`, `/api/demo-payments` and child paths |
| Tracking | 120 | `/api/tracking`, including cancellation |
| Preview | 120 | `/api/pricing`, `/api/pickup-times` and child paths |

These are conservative demonstration safeguards, not measured production capacity.
Path matching is case-insensitive, matching Express routing. All methods and malformed requests to these paths consume the relevant budget.
Other public pages/assets and staff authentication routes are unaffected; staff
login retains its separately reviewed throttling. Query strings and supplied
forwarded addresses cannot create a new budget. A random process-local HMAC key
produces bucket identifiers from peer address and group; raw addresses are not
stored in the map, database or logs by this module.

At the threshold, return JSON `429`, `Retry-After` rounded up to remaining seconds,
`Cache-Control: no-store`, `no-referrer` and `noindex`, before parsing another body
or invoking domain services. The message asks the visitor to wait and retry with
current selections. No payment/order identifier, draft or financial record is
changed by throttling. Existing client retry and validation paths retain authority;
this middleware neither creates nor retries a transaction.

Expired buckets are removed on requests. At most 10,000 live buckets are retained
per app instance; a new bucket at capacity receives 429 rather than evicting an
existing budget. This can temporarily deny legitimate newcomers during a flood.
The bounded map is swept per request, appropriate to this small demonstration;
this is not a production distributed-limiter claim.

## Verification and acceptance

`tests/unit/anonymous-limits.test.js` verifies shared checkout limits, independent
peer/group budgets, ignored forwarded addresses, exact expiry/reset, rounded retry
headers, unaffected public/auth routes, bounded saturation and expiry reclamation.
The additional `tests/unit/http-hosting.test.js` case sends 60 accepted checkout
requests to an isolated service fixture, then verifies the 61st request gets 429
without another service call; `/order` remains accessible. No real orders or
payments are made by that HTTP fixture. Existing regression tests cover the actual
domain service behavior separately.

`npm run test:unit`: **240 pass**, zero failures/skips. Run the command to
reproduce the complete server regression suite. This middleware
adds no template/style/browser script. The [payment-recovery browser refinement](verification/sec-01-payment-retry.md)
now covers throttled recovery in Chromium/WebKit; Firefox startup and existing
integrated visual/manual gates remain acceptance work. Server tests do not waive them. Keep SEC-01 open.

## Operational limits

State resets on restart and is not shared between processes or replicas. Peers
behind a NAT share a budget. Behind a reverse proxy every request may share the
proxy's socket address: do not enable public proxy hosting with these limits
without the separate reviewed topology/client-address design. Never accept
arbitrary forwarded addresses to bypass this constraint. This does not prevent
large distributed attacks, slow connections, network exhaustion or all resource
abuse. Proxy/network limits, configured HTTPS host review, monitoring and load
assessment remain separate deployment requirements.
