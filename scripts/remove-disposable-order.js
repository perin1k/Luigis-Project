import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';

// One-time approved maintenance, never an application endpoint. The CLI cannot
// select another order. Tests exercise the engine with disposable fixture IDs.
const APPROVED_REFERENCE = '540ad277-f871-446e-a8ce-c1b1a5b7fb54';
const APPROVED_CREATED_AT = '2026-10-24T20:56:01.540Z';
function identifier(strName) { return `"${strName.replaceAll('"', '""')}"`; }
function fingerprint(objValue) {
  return createHash('sha256').update(JSON.stringify(objValue)).digest('hex');
}

/**
 * Compute inbound foreign-key closure, then remove only those rows atomically.
 * Foreign keys stay enabled and are deferred until commit for cyclic quote links.
 * Triggers on affected tables are restored from their exact original SQL before
 * commit. Any failure rolls back both data and DDL, including trigger removal.
 * All unrelated rows and the entire schema are compared before committing.
 */
export function removeDisposableOrder(objDb, {
  strReference, dtCreatedAt, bApply = false, fnBeforeVerify = () => {},
}) {
  objDb.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;');
  try {
    if (objDb.prepare('PRAGMA foreign_key_check').all().length ||
        objDb.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') {
      throw new Error('Database must pass integrity and foreign-key checks first.');
    }
    const objOrder = objDb.prepare('SELECT * FROM orders WHERE public_reference=?').get(strReference);
    if (!objOrder || objOrder.created_at !== dtCreatedAt || objOrder.fulfillment_status !== 'Cancelled') {
      throw new Error('Exact approved cancelled order not found; no changes made.');
    }
    if (objDb.prepare('SELECT 1 FROM payment_attempts WHERE order_id=?').get(objOrder.id)) {
      throw new Error('Provider payment records are outside this disposable cleanup.');
    }
    const arrPaid = objDb.prepare("SELECT * FROM demo_payment_attempts WHERE order_id=? AND state='succeeded'").all(objOrder.id);
    if (arrPaid.length !== 1 || !objDb.prepare("SELECT 1 FROM demo_refund_attempts WHERE payment_id=? AND state='succeeded' AND amount_cents=?").get(arrPaid[0].id, arrPaid[0].amount_cents)) {
      throw new Error('Exactly one fully refunded demonstration payment is required.');
    }
    const arrSchema = objDb.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const arrTables = arrSchema.filter(obj => obj.type === 'table').map(obj => obj.name);
    const mapRows = new Map(arrTables.map(strTable => [strTable,
      objDb.prepare(`SELECT rowid AS __maintenance_rowid__,* FROM ${identifier(strTable)} ORDER BY rowid`).all()]));
    const mapSelected = new Map(arrTables.map(strTable => [strTable, new Set()]));
    const objRoot = mapRows.get('orders').find(obj => obj.id === objOrder.id);
    mapSelected.get('orders').add(objRoot.__maintenance_rowid__);
    const mapForeignKeys = new Map(arrTables.map(strTable => {
      const mapGroups = new Map();
      for (const objFk of objDb.prepare(`PRAGMA foreign_key_list(${identifier(strTable)})`).all()) {
        if (!mapGroups.has(objFk.id)) mapGroups.set(objFk.id, []);
        mapGroups.get(objFk.id).push(objFk);
      }
      return [strTable, [...mapGroups.values()]];
    }));
    // Follow references toward dependent rows only: never toward shared staff,
    // customer profiles, service days, menu entries, or encryption keys.
    let bChanged;
    do {
      bChanged = false;
      for (const strTable of arrTables) {
        for (const objRow of mapRows.get(strTable)) {
          if (mapSelected.get(strTable).has(objRow.__maintenance_rowid__)) continue;
          const bDependent = mapForeignKeys.get(strTable).some(arrFk =>
            mapRows.get(arrFk[0].table).some(objParent =>
              mapSelected.get(arrFk[0].table).has(objParent.__maintenance_rowid__) &&
              arrFk.every(objFk => objRow[objFk.from] != null && objRow[objFk.from] === objParent[objFk.to])));
          if (bDependent) {
            mapSelected.get(strTable).add(objRow.__maintenance_rowid__);
            bChanged = true;
          }
        }
      }
    } while (bChanged);
    // Audit entity references are intentionally polymorphic rather than FKs.
    const mapAuditEntities = {order:'orders', tracking_grant:'tracking_grants',
      cancellation_request:'cancellation_requests', refund:'demo_refund_attempts', notification:'notification_outbox'};
    for (const objAudit of mapRows.get('audit_events')) {
      const strTable = mapAuditEntities[objAudit.entity_type];
      if (strTable && mapRows.get(strTable).some(obj =>
        mapSelected.get(strTable).has(obj.__maintenance_rowid__) && obj.id === objAudit.entity_id)) {
        mapSelected.get('audit_events').add(objAudit.__maintenance_rowid__);
      }
    }
    if (mapSelected.get('orders').size !== 1) throw new Error('Cleanup would affect another order.');
    const objCounts = Object.fromEntries([...mapSelected].filter(([, setIds]) => setIds.size).map(([strTable, setIds]) => [strTable, setIds.size]));
    const objSummary = {bApplied:bApply, intOrders:1, objRemovedRows:objCounts};
    if (!bApply) { objDb.exec('ROLLBACK'); return objSummary; }

    const arrTriggers = arrSchema.filter(obj => obj.type === 'trigger' && mapSelected.get(obj.tbl_name)?.size);
    objDb.exec('PRAGMA defer_foreign_keys=ON;');
    for (const objTrigger of arrTriggers) objDb.exec(`DROP TRIGGER ${identifier(objTrigger.name)}`);
    for (const [strTable, setIds] of mapSelected) {
      const objDelete = objDb.prepare(`DELETE FROM ${identifier(strTable)} WHERE rowid=?`);
      for (const intRowId of setIds) objDelete.run(intRowId);
    }
    for (const objTrigger of arrTriggers) objDb.exec(objTrigger.sql);
    fnBeforeVerify(); // Test fault injection verifies data AND schema rollback.
    for (const strTable of arrTables) {
      const arrExpected = mapRows.get(strTable).filter(obj => !mapSelected.get(strTable).has(obj.__maintenance_rowid__));
      const arrActual = objDb.prepare(`SELECT rowid AS __maintenance_rowid__,* FROM ${identifier(strTable)} ORDER BY rowid`).all();
      if (fingerprint(arrExpected) !== fingerprint(arrActual)) throw new Error('Unrelated data changed; rolling back.');
    }
    const arrAfterSchema = objDb.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    if (fingerprint(arrSchema) !== fingerprint(arrAfterSchema) || objDb.prepare('PRAGMA foreign_key_check').all().length || objDb.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') {
      throw new Error('Final schema/integrity check failed; rolling back.');
    }
    objDb.exec('COMMIT');
    return {...objSummary, bUnrelatedRowsUnchanged:true, bSchemaRestored:true, bIntegrityPassed:true};
  } catch (objError) {
    objDb.exec('ROLLBACK');
    throw objError;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , strDatabasePath, strMode] = process.argv;
  if (!strDatabasePath || !['preview', 'apply-approved-removal'].includes(strMode)) {
    throw new Error('Usage: node remove-disposable-order.js DATABASE preview|apply-approved-removal');
  }
  const objDb = new DatabaseSync(strDatabasePath, {open:true});
  try {
    console.log(JSON.stringify(removeDisposableOrder(objDb, {strReference:APPROVED_REFERENCE,
      dtCreatedAt:APPROVED_CREATED_AT, bApply:strMode === 'apply-approved-removal'})));
  } finally { objDb.close(); }
}
