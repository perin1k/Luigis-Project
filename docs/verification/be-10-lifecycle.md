# BE-10 lifecycle integration checkpoint

October 22, 2026. Card: https://trello.com/c/jJblyoFo. This preserves the existing
scheduling, payment, menu, progress, exception, refund and retention services.
No new runtime feature, schema, account or provider is introduced.

`tests/unit/menu-service.test.js` adds one connected regression scenario using
actual isolated SQLite records and real demo payment/order creation. An employee's
ingredient change opens an inventory review; preparation is blocked and employee
cancellation is denied. An authorized administrator cancels the whole order,
releasing confirmed capacity without claiming an automatic refund. A separately
authorized demo refund returns the exact purchased total; replay creates no second
refund, signed allocations net to zero and purchased lines remain unchanged.
Foreign-key checks pass. Nothing is silently substituted or repriced.

Reproduce the lifecycle regression set:

```sh
node --test tests/unit/menu-service.test.js tests/unit/scheduling-service.test.js tests/unit/scheduling-concurrency.test.js tests/unit/order-progress.test.js tests/unit/demo-refund-service.test.js tests/unit/retention-service.test.js
```

The focused menu suite passed eight tests; the combined suite passed **30 tests**,
both with zero failures/skips. Environment: macOS arm64,
Node 24.14.1/npm 11.11.0. This test uses only disposable in-memory data; no working
database, keys, real payment or external notification is touched.

The older [scheduling checkpoint](be-10-scheduling.md) predates payment, menu,
preparation, refund and cleanup integration. Its then-open lifecycle list is
historical, not evidence that those services remain absent. Current contracts are
in [payment design](../demo-payment-design.md), [menu management](../menu-management-design.md),
[tracking/exceptions](../tracking-and-exceptions.md),
[refund design](../demo-refund-design.md) and [retention enforcement](../retention-enforcement.md).
The synchronous local payment adapter has no asynchronous provider callback;
late-provider success must not be invented as an exercised event.

BE-10 remains open for complete browser/visual/manual and platform acceptance.
This test-only increment adds no UI and claims no fresh Lighthouse or browser pass.
Firefox, Windows/Linux and manual accessibility gates remain intact. Existing
concurrent role-hierarchy implementation is not changed or claimed here.
