import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase, runTransaction} from '../../src/data/database.js';
import {applyMigrations} from '../../src/data/migrations.js';
import {seedStaffOrders} from '../fixtures/staff-orders-data.js';
import {createOrderExceptionService} from '../../src/staff/order-exception-service.js';
import {createDemoRefundService} from '../../src/payments/demo-refund-service.js';
import {removeDisposableOrder} from '../../scripts/remove-disposable-order.js';

function fixture(fnWork) {
  const objDb = openDatabase(':memory:');
  try {
    applyMigrations(objDb);
    const arrOrders = seedStaffOrders(objDb, {intCount:2, intTipPercent:20});
    objDb.prepare("INSERT INTO staff_users(id,identity_subject,role) VALUES ('admin','synthetic-admin','admin')").run();
    // These tests target offline maintenance, not authentication. Application
    // services still create genuine validated cancellation/refund records.
    const objSessions = {executeAuthorized(strToken, strPermission, fnWork) {
      return runTransaction(objDb, () => fnWork({strUserId:'admin'}, new Date('2026-10-21T15:01:00.000Z')));
    }};
    const objTarget = arrOrders[0];
    const objDecision = createOrderExceptionService(objDb, objSessions).decide('', objTarget.strReference, {intRevision:2, strAction:'cancel'});
    createDemoRefundService(objDb, objSessions).refund('', objTarget.strReference, {intRevision:objDecision.intRevision, strRequestId:randomUUID()});
    const objOptions = {strReference:objTarget.strReference,
      dtCreatedAt:objDb.prepare('SELECT created_at FROM orders WHERE id=?').get(objTarget.strOrderId).created_at};
    fnWork({objDb, objOptions, arrOrders});
  } finally { objDb.close(); }
}

test('preview writes nothing; removal deletes one refunded order and preserves schema and other records', () => fixture(({objDb, objOptions, arrOrders}) => {
  assert.equal(removeDisposableOrder(objDb, objOptions).bApplied, false);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM orders').get().n, 2);
  const objResult = removeDisposableOrder(objDb, {...objOptions, bApply:true});
  assert.equal(objResult.bSchemaRestored, true);
  assert.equal(objResult.bUnrelatedRowsUnchanged, true);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM orders').get().n, 1);
  assert.equal(objDb.prepare('SELECT id FROM orders WHERE id=?').get(arrOrders[1].strOrderId).id, arrOrders[1].strOrderId);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n, 0);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM demo_payment_attempts').get().n, 1);
  assert.throws(() => objDb.prepare('DELETE FROM orders').run(), /immutable/);
  assert.throws(() => objDb.prepare('DELETE FROM demo_payment_attempts').run());
  assert.throws(() => removeDisposableOrder(objDb, {...objOptions, bApply:true}), /not found/);
}));

test('verification failure rolls back deleted data and dropped triggers', () => fixture(({objDb, objOptions}) => {
  assert.throws(() => removeDisposableOrder(objDb, {...objOptions, bApply:true,
    fnBeforeVerify() { throw new Error('synthetic interruption'); }}), /synthetic interruption/);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM orders').get().n, 2);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM demo_refund_attempts').get().n, 1);
  assert.throws(() => objDb.prepare('DELETE FROM orders').run(), /immutable/);
  assert.equal(objDb.prepare('PRAGMA foreign_key_check').all().length, 0);
}));

test('wrong timestamp, missing reference and unrefunded order fail closed', () => fixture(({objDb, objOptions, arrOrders}) => {
  assert.throws(() => removeDisposableOrder(objDb, {...objOptions, dtCreatedAt:'wrong', bApply:true}), /not found/);
  assert.throws(() => removeDisposableOrder(objDb, {...objOptions, strReference:'missing', bApply:true}), /not found/);
  assert.throws(() => removeDisposableOrder(objDb, {...objOptions, strReference:arrOrders[1].strReference, bApply:true}), /not found/);
  assert.equal(objDb.prepare('SELECT count(*) AS n FROM orders').get().n, 2);
}));
